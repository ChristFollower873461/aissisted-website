#!/usr/bin/env python3
"""All network fixtures are loopback; all logs/state/credentials are temporary."""
import contextlib
import io
import json
import multiprocessing
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import lead_watch_common as common
import meta_lead_watch as meta


def append_worker(path):
    common.append_unique(Path(path), [{"source": "meta", "time": "2026-11-21T12:00:00Z", "id": "42"}])


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        self.server.seen.append((self.path, self.headers.get("Authorization")))
        query = parse_qs(urlsplit(self.path).query)
        mode = self.server.mode
        if mode == "retry" and len(self.server.seen) < 3:
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b"SECRET-DO-NOT-PRINT")
            return
        if mode == "auth":
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"SECRET-DO-NOT-PRINT")
            return
        if mode == "redirect":
            self.send_response(302)
            self.send_header("Location", "https://example.invalid/?access_token=SECRET")
            self.end_headers()
            return
        if mode == "broken":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"not json SECRET")
            return
        stamp = "2026-11-21T12:00:00+0000"
        rows = [{"id": "2", "created_time": stamp, "field_data": "private body"}]
        payload = {"data": rows}
        if not query.get("after"):
            nxt = self.server.base + "?after=page2&access_token=SERVER-SECRET"
            if mode == "cross":
                nxt = "https://example.invalid/leads"
            if mode == "cycle":
                nxt = self.path
            payload["paging"] = {"next": nxt}
        else:
            if mode == "latefail":
                self.send_response(500)
                self.end_headers()
                return
            payload["data"].append({"id": "1", "created_time": stamp})
            # Old lead discovered late is retained too; no cutoff can hide it.
            payload["data"].append({"id": "3", "created_time": "2020-01-01T00:00:00Z"})
        if mode == "invalid":
            payload["data"][0]["id"] = "name@example.com"
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())


class WatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
        self.server.base = "http://127.0.0.1:%s/leads" % self.server.server_port
        self.server.seen = []
        self.server.mode = "normal"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def collect(self):
        with patch.object(meta.time, "sleep"):
            return meta.collect(self.server.base, "CLIENT-SECRET", fixture=True)

    def test_pagination_overlap_dedup_and_no_pii(self):
        rows = self.collect()
        self.assertEqual({r["id"] for r in rows}, {"1", "2", "3"})
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows, self.collect())
        self.assertNotIn("private", json.dumps(rows))
        for path, auth in self.server.seen:
            self.assertNotIn("SECRET", path)
            self.assertEqual(auth, "Bearer CLIENT-SECRET")
            self.assertEqual(parse_qs(urlsplit(path).query)["fields"], ["id,created_time"])

    def test_retries_and_fail_closed(self):
        self.server.mode = "retry"
        self.assertEqual(len(self.collect()), 3)
        self.assertEqual(len(self.server.seen), 4)
        for mode in ("auth", "redirect", "broken", "latefail", "cross", "cycle", "invalid"):
            with self.subTest(mode=mode):
                self.server.mode = mode
                self.server.seen = []
                with self.assertRaises(common.WatchError) as error:
                    self.collect()
                self.assertNotIn("SECRET", str(error.exception))
        self.server.mode = "normal"
        with self.assertRaises(common.WatchError):
            meta.collect(self.server.base, "secret", max_pages=1, fixture=True)

    def test_origin_guards(self):
        root = "https://graph.facebook.com/v25.0/123/leads"
        for candidate in ("https://evil.invalid/v25.0/123/leads",
                          "http://graph.facebook.com/v25.0/123/leads",
                          "https://graph.facebook.com:444/v25.0/123/leads",
                          "https://user:secret@graph.facebook.com/v25.0/123/leads",
                          "https://graph.facebook.com/v25.0/me", root + "#fragment"):
            with self.assertRaises(common.WatchError):
                meta.safe_url(candidate, root)
        with self.assertRaises(common.WatchError):
            meta.safe_url(self.server.base, self.server.base)

    def test_append_concurrency_and_manual_fields(self):
        log = self.root / "leads.jsonl"
        original = '{"source":"website","time":"2026-11-21T00:00:00Z","id":"42","answered_at":"later","outcome":"won"}\n'
        log.write_text(original)
        procs = [multiprocessing.Process(target=append_worker, args=(str(log),)) for _ in range(6)]
        for process in procs:
            process.start()
        for process in procs:
            process.join(10)
            self.assertEqual(process.exitcode, 0)
        self.assertTrue(log.read_text().startswith(original))
        self.assertEqual(len(log.read_text().splitlines()), 2)

    def test_bad_log_fails_closed_and_atomic_state(self):
        log = self.root / "leads.jsonl"
        log.write_text('{"broken"')
        with self.assertRaises(ValueError):
            common.append_unique(log, [{"source": "meta", "time": "now", "id": "1"}])
        self.assertEqual(log.read_text(), '{"broken"')
        state = self.root / "state.json"
        common.atomic_json(state, {"candidates": []})
        with patch.object(common.os, "replace", side_effect=OSError("simulated")):
            with self.assertRaises(OSError):
                common.atomic_json(state, {"candidates": [1]})
        self.assertEqual(json.loads(state.read_text()), {"candidates": []})
        self.assertEqual(state.stat().st_mode & 0o777, 0o600)

    def test_main_repeat_stdout_and_failure_no_commit(self):
        token = self.root / "token"
        token.write_text("CLIENT-SECRET")
        token.chmod(0o600)
        log, state = self.root / "log", self.root / "state"
        args = ["--form-id", "123", "--token-file", str(token), "--log", str(log), "--state", str(state)]
        real_collect = meta.collect
        def fixture_collect(*a, **kw):
            return real_collect(self.server.base, "CLIENT-SECRET", fixture=True)
        outputs = []
        for _ in range(2):
            out = io.StringIO()
            with patch.object(meta, "collect", side_effect=fixture_collect), contextlib.redirect_stdout(out):
                self.assertEqual(meta.main(args), 0)
            outputs.append(out.getvalue())
        self.assertEqual(outputs[0], outputs[1])
        self.assertEqual(len(log.read_text().splitlines()), 3)
        saved = (log.read_bytes(), state.read_bytes())
        self.server.mode = "latefail"
        out, err = io.StringIO(), io.StringIO()
        with patch.object(meta, "collect", side_effect=fixture_collect), patch.object(meta.time, "sleep"), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(meta.main(args), 1)
        self.assertEqual(out.getvalue(), "")
        self.assertNotIn("SECRET", err.getvalue())
        self.assertEqual(saved, (log.read_bytes(), state.read_bytes()))
        # Even an output failure after persistence is not a delivery ack.
        self.server.mode = "normal"
        with patch.object(meta, "collect", side_effect=fixture_collect), patch.object(meta, "print", side_effect=[BrokenPipeError(), None], create=True):
            self.assertEqual(meta.main(args), 1)
        out = io.StringIO()
        with patch.object(meta, "collect", side_effect=fixture_collect), contextlib.redirect_stdout(out):
            self.assertEqual(meta.main(args), 0)
        self.assertEqual(out.getvalue(), outputs[0])

    def test_credentials_and_website_requires_explicit_configuration(self):
        token = self.root / "token"
        token.write_text("secret")
        token.chmod(0o644)
        with self.assertRaises(common.WatchError):
            common.secret_file(token)
        token.chmod(0o600)
        self.assertEqual(common.secret_file(token), "secret")
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(meta.main(["--form-id", "123", "--token-file", str(token),
                                        "--log", str(token), "--state", str(self.root / "state")]), 1)
        self.assertEqual(token.read_text(), "secret")
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("website_lead_watch.py"))],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "")
        self.assertIn("--account-id", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
