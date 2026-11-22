"""Small stdlib-only, metadata-only watcher primitives (POSIX/macOS)."""
import contextlib
import fcntl
import json
import os
from pathlib import Path
import stat
import tempfile

DEFAULT_LOG = Path("/Users/standley/.openclaw/workspace/memory/inbox/leads.jsonl")
DEFAULT_STATE = Path("/Users/standley/.openclaw/state/meta-lead-watch.json")


class WatchError(Exception):
    """Messages are fixed codes, never upstream payloads or credentials."""


def secret_file(filename):
    path = Path(filename).expanduser().resolve(strict=True)
    repo = Path(__file__).resolve().parent.parent
    if path == repo or repo in path.parents:
        raise WatchError("credential_must_be_outside_repo")
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
        raise WatchError("credential_requires_private_regular_file")
    value = path.read_text().strip()
    if not value or any(c.isspace() for c in value):
        raise WatchError("invalid_credential")
    return value


@contextlib.contextmanager
def locked(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(str(path) + ".lock", os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as out:
            json.dump(value, out, sort_keys=True)
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def append_unique(path, rows):
    """Never rewrite existing rows: Ark owns answered_at/outcome.
    All writers/editors must acquire the same <log>.lock.
    A malformed/partial log fails closed for operator repair, never erases it.
    """
    path = Path(path)
    with locked(path):
        seen = set()
        if path.exists():
            with path.open() as source:
                for line in source:
                    row = json.loads(line)
                    seen.add((row["source"], row["id"]))
            if path.stat().st_size:
                with path.open("rb") as source:
                    source.seek(-1, os.SEEK_END)
                    if source.read(1) != b"\n":
                        raise WatchError("incomplete_log")
        new = []
        for row in rows:
            key = (row["source"], row["id"])
            if key not in seen:
                new.append({k: row[k] for k in ("source", "time", "id")})
                seen.add(key)
        if new:
            fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            with os.fdopen(fd, "a") as out:
                for row in new:
                    out.write(json.dumps(row, sort_keys=True) + "\n")
                out.flush()
                os.fsync(out.fileno())
            directory = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
