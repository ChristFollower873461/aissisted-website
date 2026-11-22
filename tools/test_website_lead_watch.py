#!/usr/bin/env python3
"""D1 fixtures only; no live credentials or CRM data. Run on Neo."""
import contextlib
import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import website_lead_watch as website

real_collect = website.collect


class D1Fixture(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append(data)
        if self.server.mode == "retry" and len(self.server.requests) < 3:
            self.send_response(503)
            self.end_headers()
            return
        if self.server.mode == "auth":
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"SECRET-NEVER-LOG")
            return
        if self.server.mode == "redirect":
            self.send_response(302)
            self.send_header("Location", "https://example.invalid/?secret=NEVER")
            self.end_headers()
            return
        if self.server.mode == "latefail" and int(data["params"][0]) > 0:
            result = {"success": False, "errors": [{"message": "SECRET-NEVER-LOG"}]}
        else:
            if data["sql"] != website.SELECT:
                self.send_response(400)
                self.end_headers()
                return
            rows = [dict(row) for row in self.server.db.execute(data["sql"], data["params"])]
            result = {"success": True, "result": [{"success": True, "meta": {"changed_db": False}, "results": rows}]}
            if self.server.mode == "malformed":
                result["result"][0]["results"][0]["created_at"] = "SECRET"
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())


class WebsiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), D1Fixture)
        self.endpoint = "http://127.0.0.1:%s/query" % self.server.server_port
        self.server.db = sqlite3.connect(":memory:", check_same_thread=False)
        self.server.db.row_factory = sqlite3.Row
        self.server.db.execute("""CREATE TABLE website_intake_submissions (
            id INTEGER PRIMARY KEY, created_at TEXT, qualified_source_event_id TEXT,
            source_channel TEXT, utm_source TEXT, message TEXT)""")
        self.server.mode, self.server.requests = "normal", []
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        for i in range(1, 4):
            self.insert(i, "2026-11-21 12:00:00")
        self.token = self.root / "credential"
        self.token.write_text("TEST-NOT-A-REAL-SECRET")
        self.token.chmod(0o600)

    def insert(self, number, stamp, event=None, source="meta"):
        self.server.db.execute("INSERT INTO website_intake_submissions VALUES (?, ?, ?, ?, ?, ?)",
                               [number, stamp, event or "website-contact-inq_test" + str(number),
                                "website", source, "PRIVATE-MESSAGE-NEVER-READ"])

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.server.db.close()
        self.temp.cleanup()

    def collect(self, *args, **kwargs):
        with patch.object(website.time, "sleep"):
            return real_collect(self.endpoint, "TEST", page_size=2, fixture=True)

    def cli(self):
        args = ["--account-id", "a" * 32, "--database-id", "11111111-1111-1111-1111-111111111111",
                "--token-file", str(self.token), "--log", str(self.root / "log"),
                "--state", str(self.root / "state")]
        out, err = io.StringIO(), io.StringIO()
        with patch.object(website, "collect", side_effect=self.collect), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = website.main(args)
        return result, out.getvalue(), err.getvalue()

    def test_sql_metadata_pagination_repeat_and_old_arrival(self):
        rows = self.collect()
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["source"], "website/meta")
        self.assertNotIn("PRIVATE", json.dumps(rows))
        self.assertNotIn("message", website.SELECT.lower())
        self.assertEqual(rows, self.collect())
        self.insert(4, "2020-01-01 00:00:00")
        self.assertEqual(len(self.collect()), 4)
        for request in self.server.requests:
            self.assertTrue(request["sql"].startswith("SELECT "))
            self.assertNotIn(";", request["sql"])

    def test_cli_dedupe_manual_fields_and_failed_poll_atomicity(self):
        first = self.cli()
        self.assertEqual(first[0], 0)
        self.assertEqual(self.cli(), first)
        log = self.root / "log"
        rows = [json.loads(line) for line in log.read_text().splitlines()]
        self.assertEqual(len(rows), 3)
        rows[0]["answered_at"] = "2026-11-21T13:00:00Z"
        rows[0]["outcome"] = "test"
        log.write_text("".join(json.dumps(row) + "\n" for row in rows))
        self.cli()
        self.assertEqual(json.loads(log.read_text().splitlines()[0])["outcome"], "test")
        previous = log.read_bytes(), (self.root / "state").read_bytes()
        self.server.mode = "latefail"
        result, out, err = self.cli()
        self.assertEqual(result, 1)
        self.assertEqual(out, "")
        self.assertNotIn("SECRET", err)
        self.assertEqual(previous, (log.read_bytes(), (self.root / "state").read_bytes()))

    def test_retry_and_failure_guards(self):
        self.server.mode = "retry"
        self.assertEqual(len(self.collect()), 3)
        self.assertGreaterEqual(len(self.server.requests), 3)
        for mode in ("auth", "redirect", "malformed"):
            self.server.mode = mode
            with self.assertRaises(website.WatchError):
                self.collect()
        with self.assertRaises(website.WatchError):
            website.query("https://example.invalid/query", "TEST", 0, 100)
        self.server.mode = "normal"
        with self.assertRaises(website.WatchError):
            website.collect(self.endpoint, "TEST", max_pages=1, page_size=1, fixture=True)

    def test_lost_output_and_missing_credentials(self):
        first = self.cli()
        with patch.object(website, "collect", side_effect=self.collect), patch.object(website, "print", side_effect=[BrokenPipeError(), None], create=True):
            # Reuse cli helper's explicit temporary paths; stdout failure is not an ack.
            self.assertEqual(self.cli()[0], 1)
        self.assertEqual(self.cli(), first)
        self.token.unlink()
        self.assertEqual(self.cli()[0], 1)

    @unittest.skipUnless(os.environ.get("QA_OUTPUT"), "browser proof not requested")
    def test_browser_receipt_through_real_watcher(self):
        proof = Path(os.environ["QA_OUTPUT"]) / "isolated-lead.json"
        if not proof.exists():
            self.fail("Browser receipt artifact missing")
        lead = json.loads(proof.read_text())
        self.server.db.execute("DELETE FROM website_intake_submissions")
        self.insert(lead["crm"]["id"], lead["inquiry"]["created_at"],
                    lead["crm"]["qualifiedSourceEventId"], lead["crm"]["utmSource"])
        result, out, err = self.cli()
        self.assertEqual(result, 0, err)
        rows = json.loads(out)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], lead["inquiry"]["id"])
        self.assertEqual(rows[0]["source"], "website/meta")
        self.assertEqual(self.cli()[1], out)
        self.assertEqual(len((self.root / "log").read_text().splitlines()), 1)
        (proof.parent / "watcher-proof.json").write_text(json.dumps({
            "status": "passed", "rows": rows, "repeatedPoll": "same stdout; one log entry",
            "remoteWrites": 0, "endpoint": "D1 query fixture (fixed SELECT)"
        }, indent=2))


if __name__ == "__main__":
    unittest.main(verbosity=2)
