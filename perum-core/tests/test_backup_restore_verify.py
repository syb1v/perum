import hashlib
import json
import pytest

from tools import backup_restore_verify as verify


class FakeRunner:
    def __init__(self, facts=None):
        self.calls = []
        default = {"schema_count": 2, "table_count": 2, "total_row_count": 7, "table_row_counts": {"public.accounts": 3, "public.schools": 4}}
        self.facts = iter(facts or (default, default))

    def open_session(self, command):
        session = FakeSession(next(self.facts))
        self.calls.append((command, None))
        self.sessions = getattr(self, "sessions", []) + [session]
        return session

    def run(self, command, *, input_text=None, input_stream=None, output=None):
        self.calls.append((command, input_text))
        if "pg_dump" in command:
            output.write(b"custom-backup")
            return ""
        if "pg_restore" in command:
            assert input_stream.read() == b"custom-backup"
            return ""
        if "psql" in command:
            return fact_rows(next(self.facts))
        return ""


class FakeSession:
    def __init__(self, facts):
        self.lines = iter(fact_rows(facts, snapshot="00000003-0000001B-1").splitlines(keepends=True))
        self.writes = []
        self.closed = False

    def write(self, text):
        self.writes.append(text)

    def readline(self):
        return next(self.lines)

    def close(self):
        self.closed = True


def fact_rows(facts, snapshot=None):
    rows = []
    if snapshot is not None:
        rows.append({"kind": "snapshot", "value": snapshot})
    rows.append({"kind": "schema_count", "value": facts["schema_count"]})
    rows.extend({"kind": "table", "name": name, "row_count": count} for name, count in facts["table_row_counts"].items())
    rows.append({"kind": "ready"})
    return "\n".join(json.dumps(row) for row in rows)


def config(tmp_path):
    return verify.Config("source-db", "perum", "postgres", "approved-disposable-db", "postgres", tmp_path, "approved-disposable-db")


def test_verify_streams_backup_records_safe_manifest_and_drops_database(tmp_path):
    runner = FakeRunner()
    backup, manifest_path, facts = verify.verify_backup_restore(config(tmp_path), "source-secret", "target-secret", runner)

    manifest = json.loads(manifest_path.read_text())
    assert facts == {"schema_count": 2, "table_count": 2, "total_row_count": 7, "table_row_counts": {"public.accounts": 3, "public.schools": 4}}
    assert manifest == {
        "manifest_version": 2,
        "backup_file": backup.name,
        "format": "pg_dump-custom",
        "sha256": hashlib.sha256(b"custom-backup").hexdigest(),
        "source_facts": facts,
    }
    commands = [call[0] for call in runner.calls]
    assert any("pg_dump" in command for command in commands)
    dump_command = next(command for command in commands if "pg_dump" in command)
    assert dump_command[dump_command.index("--snapshot") + 1] == "00000003-0000001B-1"
    assert any("pg_restore" in command for command in commands)
    assert "-i" in next(command for command in commands if "pg_restore" in command)
    facts_call = next(call for call in runner.calls if "psql" in call[0] and call[1] == verify.FACTS_SQL)
    assert "-i" in facts_call[0]
    assert any("dropdb" in command and "--force" in command for command in commands)
    assert all("source-secret" not in part and "target-secret" not in part for command in commands for part in command)
    assert "source-secret" not in manifest_path.read_text()
    assert "target-secret" not in manifest_path.read_text()
    assert runner.sessions[0].closed


def test_restore_failure_still_drops_temporary_database(tmp_path):
    runner = FakeRunner(({"schema_count": 1, "table_count": 1, "total_row_count": 3, "table_row_counts": {"public.items": 3}},))
    original_run = runner.run

    def fail_restore(command, **kwargs):
        if "pg_restore" in command:
            raise verify.VerifyError("command failed: docker (exit 1)")
        return original_run(command, **kwargs)

    runner.run = fail_restore

    with pytest.raises(verify.VerifyError, match="command failed"):
        verify.verify_backup_restore(config(tmp_path), "secret", "secret", runner)

    assert any("dropdb" in command for command, _ in runner.calls)
    assert sum("rm" in command for command, _ in runner.calls) == 2


def test_fact_mismatch_fails_closed_and_drops_database(tmp_path):
    source = {"schema_count": 2, "table_count": 1, "total_row_count": 7, "table_row_counts": {"public.items": 7}}
    restored = {"schema_count": 2, "table_count": 1, "total_row_count": 6, "table_row_counts": {"public.items": 6}}
    runner = FakeRunner((source, restored))

    with pytest.raises(verify.VerifyError, match="do not match"):
        verify.verify_backup_restore(config(tmp_path), "secret", "secret", runner)

    assert any("dropdb" in command for command, _ in runner.calls)


def test_check_only_validates_checksum_and_rejects_tampering(tmp_path):
    backup = tmp_path / "existing.dump"
    backup.write_bytes(b"backup")
    manifest = tmp_path / "existing.dump.manifest.json"
    manifest.write_text(json.dumps({
        "manifest_version": 2,
        "backup_file": backup.name,
        "format": "pg_dump-custom",
        "sha256": hashlib.sha256(b"backup").hexdigest(),
        "source_facts": {"schema_count": 3, "table_count": 1, "total_row_count": 9, "table_row_counts": {"public.items": 9}},
    }))

    assert verify.check_backup(backup, manifest) == {"schema_count": 3, "table_count": 1, "total_row_count": 9, "table_row_counts": {"public.items": 9}}
    backup.write_bytes(b"tampered")
    with pytest.raises(verify.VerifyError, match="checksum mismatch"):
        verify.check_backup(backup, manifest)


def test_main_requires_exact_target_approval(tmp_path, monkeypatch):
    monkeypatch.setenv("PERUM_PG_PASSWORD", "secret")
    result = verify.main([
        "--source-container", "source", "--source-database", "perum", "--source-user", "postgres",
        "--target-container", "disposable", "--target-user", "postgres",
        "--approve-target-container", "other", "--output-dir", str(tmp_path),
    ])
    assert result == 2


def test_verifier_refuses_same_source_and_target_before_commands(tmp_path):
    runner = FakeRunner()
    unsafe = verify.Config("same-db", "perum", "postgres", "same-db", "postgres", tmp_path, "same-db")

    with pytest.raises(verify.VerifyError, match="must be distinct"):
        verify.verify_backup_restore(unsafe, "secret", "secret", runner)

    assert runner.calls == []


def test_verifier_requires_exact_disposable_target_approval_before_commands(tmp_path):
    runner = FakeRunner()
    unsafe = verify.Config("source-db", "perum", "postgres", "target-db", "postgres", tmp_path, "other-db")

    with pytest.raises(verify.VerifyError, match="approval must exactly match"):
        verify.verify_backup_restore(unsafe, "secret", "secret", runner)

    assert runner.calls == []


def test_facts_query_uses_quoted_identifiers_and_bounded_execution():
    assert "format(" in verify.FACTS_SQL
    assert "%I.%I" in verify.FACTS_SQL
    assert "statement_timeout" in verify.FACTS_SQL
    assert "lock_timeout" in verify.FACTS_SQL
    assert "CREATE TEMP TABLE" not in verify.FACTS_SQL
    assert "pg_export_snapshot" in verify.SNAPSHOT_FACTS_SQL
    assert "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" in verify.SNAPSHOT_FACTS_SQL


def test_dump_failure_closes_exporting_snapshot_session(tmp_path):
    runner = FakeRunner()
    original_run = runner.run

    def fail_dump(command, **kwargs):
        if "pg_dump" in command:
            raise verify.VerifyError("dump failed")
        return original_run(command, **kwargs)

    runner.run = fail_dump

    with pytest.raises(verify.VerifyError, match="dump failed"):
        verify.verify_backup_restore(config(tmp_path), "secret", "secret", runner)

    assert runner.sessions[0].closed
    assert sum("rm" in command for command, _ in runner.calls) == 2


def test_manifest_rejects_inconsistent_or_legacy_facts(tmp_path):
    backup = tmp_path / "existing.dump"
    backup.write_bytes(b"backup")
    manifest = tmp_path / "existing.dump.manifest.json"
    manifest.write_text(json.dumps({
        "manifest_version": 2,
        "backup_file": backup.name,
        "format": "pg_dump-custom",
        "sha256": hashlib.sha256(b"backup").hexdigest(),
        "source_facts": {"schema_count": 1, "table_count": 1, "total_row_count": 8, "table_row_counts": {"public.items": 9}},
    }))

    with pytest.raises(verify.VerifyError, match="invalid manifest facts"):
        verify.check_backup(backup, manifest)


def test_interrupt_after_database_creation_still_runs_cleanup(tmp_path):
    runner = FakeRunner(({"schema_count": 1, "table_count": 1, "total_row_count": 3, "table_row_counts": {"public.items": 3}},))
    original_run = runner.run

    def interrupt_restore(command, **kwargs):
        if "pg_restore" in command:
            raise KeyboardInterrupt
        return original_run(command, **kwargs)

    runner.run = interrupt_restore

    with pytest.raises(KeyboardInterrupt):
        verify.verify_backup_restore(config(tmp_path), "secret", "secret", runner)

    assert any("dropdb" in command for command, _ in runner.calls)
    assert sum("rm" in command for command, _ in runner.calls) == 2


def test_createdb_failure_still_attempts_drop(tmp_path):
    runner = FakeRunner(({"schema_count": 1, "table_count": 1, "total_row_count": 3, "table_row_counts": {"public.items": 3}},))
    original_run = runner.run

    def fail_createdb(command, **kwargs):
        if "createdb" in command:
            raise verify.VerifyError("createdb status unknown")
        return original_run(command, **kwargs)

    runner.run = fail_createdb

    with pytest.raises(verify.VerifyError, match="createdb status unknown"):
        verify.verify_backup_restore(config(tmp_path), "secret", "secret", runner)

    assert any("dropdb" in command and "--if-exists" in command for command, _ in runner.calls)
