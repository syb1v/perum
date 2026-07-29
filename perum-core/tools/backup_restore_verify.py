import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, BinaryIO
from uuid import uuid4


SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
FACTS_ROWS_SQL = r"""
SELECT json_build_object('kind', 'schema_count', 'value', count(*))
FROM pg_namespace
WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema';
SELECT format(
  'SELECT json_build_object(''kind'', ''table'', ''name'', %L, ''row_count'', count(*)) FROM %I.%I;',
  format('%I.%I', n.nspname, c.relname), n.nspname, c.relname
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT LIKE 'pg_%'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname
\gexec
SELECT json_build_object('kind', 'ready');
"""
FACTS_SQL = rf"""
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
{FACTS_ROWS_SQL}
ROLLBACK;
"""
SNAPSHOT_FACTS_SQL = rf"""
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SELECT json_build_object('kind', 'snapshot', 'value', pg_export_snapshot());
{FACTS_ROWS_SQL}
"""


class VerifyError(Exception):
    pass


class CommandRunner:
    def run(self, command: list[str], *, input_text: str | None = None, input_stream: BinaryIO | None = None, output: BinaryIO | None = None) -> str:
        if input_text is not None and input_stream is not None:
            raise VerifyError("multiple command inputs refused")
        try:
            completed = subprocess.run(
                command,
                input=input_text.encode() if input_text is not None else None,
                stdin=input_stream,
                stdout=output if output is not None else subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
            )
        except (OSError, subprocess.CalledProcessError) as exc:
            code = getattr(exc, "returncode", "unavailable")
            operation = next(
                (part for part in ("pg_dump", "createdb", "pg_restore", "psql", "dropdb", "rm") if part in command),
                command[0],
            )
            raise VerifyError(f"command failed: {operation} (exit {code})") from exc
        return "" if output is not None else completed.stdout.decode("utf-8").strip()

    def open_session(self, command: list[str]) -> "CommandSession":
        return CommandSession(command)


class CommandSession:
    def __init__(self, command: list[str]):
        self._stderr = open(os.devnull, "wb")
        try:
            self._process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self._stderr, text=True, bufsize=1)
        except OSError as exc:
            self._stderr.close()
            raise VerifyError(f"command failed to start: {command[0]}") from exc

    def write(self, text: str) -> None:
        if self._process.stdin is None:
            raise VerifyError("database session input is unavailable")
        try:
            self._process.stdin.write(text)
            self._process.stdin.flush()
        except (OSError, BrokenPipeError) as exc:
            raise VerifyError("database session closed unexpectedly") from exc

    def readline(self) -> str:
        if self._process.stdout is None:
            raise VerifyError("database session output is unavailable")
        line = self._process.stdout.readline()
        if not line:
            raise VerifyError("database session closed before snapshot was ready")
        return line

    def close(self) -> None:
        write_error: VerifyError | None = None
        try:
            if self._process.poll() is None:
                try:
                    self.write("ROLLBACK;\n\\q\n")
                except VerifyError as exc:
                    write_error = exc
            code = self._process.wait(timeout=10)
            if code != 0:
                raise VerifyError(f"database session failed (exit {code})")
            if write_error is not None:
                raise write_error
        except subprocess.TimeoutExpired as exc:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait()
            raise VerifyError("database session did not close") from exc
        finally:
            self._stderr.close()


@dataclass(frozen=True)
class Config:
    source_container: str
    source_database: str
    source_user: str
    target_container: str
    target_user: str
    output_dir: Path
    approved_target_container: str


def _safe_name(value: str, label: str) -> str:
    if not SAFE_NAME.fullmatch(value):
        raise VerifyError(f"invalid {label}")
    return value


def _password(env_name: str, password_file: Path | None, fallback: str | None = None) -> str:
    if password_file is not None and env_name in os.environ:
        raise VerifyError(f"use either {env_name} or its password file, not both")
    if password_file is not None:
        try:
            value = password_file.read_text(encoding="utf-8").rstrip("\r\n")
        except OSError as exc:
            raise VerifyError("could not read password file") from exc
    else:
        value = os.environ.get(env_name, fallback or "")
    if not value or "\n" in value or "\r" in value or "\x00" in value:
        raise VerifyError(f"a non-empty single-line {env_name} or password file is required")
    return value


def _pgpass(user: str, password: str) -> str:
    escaped_user = user.replace("\\", "\\\\").replace(":", "\\:")
    escaped_password = password.replace("\\", "\\\\").replace(":", "\\:")
    return f"*:*:*:{escaped_user}:{escaped_password}\n"


def _docker(container: str, pgpass_path: str, command: list[str], *, interactive: bool = False) -> list[str]:
    args = ["docker", "exec"]
    if interactive:
        args.append("-i")
    args.extend(["--env", f"PGPASSFILE={pgpass_path}", container])
    args.extend(command)
    return args


def _install_pgpass(runner: CommandRunner, container: str, path: str, user: str, password: str) -> None:
    command = ["docker", "exec", "-i", container, "sh", "-c", 'umask 077; cat > "$1"', "sh", path]
    runner.run(command, input_text=_pgpass(user, password))


def _remove_pgpass(runner: CommandRunner, container: str, path: str) -> None:
    runner.run(["docker", "exec", container, "rm", "-f", "--", path])


def _psql_command(container: str, pgpass_path: str, user: str, database: str, *, interactive: bool = False) -> list[str]:
    return _docker(container, pgpass_path, ["psql", "--no-psqlrc", "--quiet", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--username", user, "--dbname", database], interactive=interactive)


def _parse_fact_rows(lines: list[str]) -> tuple[str | None, dict[str, Any]]:
    snapshot = None
    schema_count = None
    table_row_counts: dict[str, int] = {}
    try:
        rows = [json.loads(line) for line in lines]
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError
            if row.get("kind") == "snapshot" and snapshot is None and set(row) == {"kind", "value"} and isinstance(row["value"], str) and row["value"]:
                snapshot = row["value"]
            elif row.get("kind") == "schema_count" and schema_count is None and set(row) == {"kind", "value"} and type(row["value"]) is int and row["value"] >= 0:
                schema_count = row["value"]
            elif row.get("kind") == "table" and set(row) == {"kind", "name", "row_count"} and isinstance(row["name"], str) and row["name"] and type(row["row_count"]) is int and row["row_count"] >= 0:
                if row["name"] in table_row_counts:
                    raise ValueError
                table_row_counts[row["name"]] = row["row_count"]
            elif row != {"kind": "ready"}:
                raise ValueError
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise VerifyError("could not parse verification facts") from exc
    facts = {"schema_count": schema_count, "table_count": len(table_row_counts), "total_row_count": sum(table_row_counts.values()), "table_row_counts": table_row_counts}
    if not rows or rows[-1] != {"kind": "ready"} or not _valid_facts(facts):
        raise VerifyError("invalid verification facts")
    return snapshot, facts


def _facts(runner: CommandRunner, container: str, pgpass_path: str, user: str, database: str) -> dict[str, Any]:
    output = runner.run(_psql_command(container, pgpass_path, user, database, interactive=True), input_text=FACTS_SQL)
    _, facts = _parse_fact_rows(output.splitlines())
    return facts


def _snapshot_facts(runner: CommandRunner, container: str, pgpass_path: str, user: str, database: str) -> tuple[CommandSession, str, dict[str, Any]]:
    session = runner.open_session(_psql_command(container, pgpass_path, user, database, interactive=True))
    try:
        session.write(SNAPSHOT_FACTS_SQL)
        lines = []
        while True:
            line = session.readline().strip()
            lines.append(line)
            try:
                if json.loads(line) == {"kind": "ready"}:
                    break
            except json.JSONDecodeError:
                pass
        snapshot, facts = _parse_fact_rows(lines)
        if snapshot is None:
            raise VerifyError("database did not export a snapshot")
        return session, snapshot, facts
    except BaseException:
        session.close()
        raise


def _valid_facts(facts: Any) -> bool:
    if not isinstance(facts, dict) or set(facts) != {"schema_count", "table_count", "total_row_count", "table_row_counts"}:
        return False
    counts = (facts["schema_count"], facts["table_count"], facts["total_row_count"])
    rows = facts["table_row_counts"]
    return (
        all(type(value) is int and value >= 0 for value in counts)
        and isinstance(rows, dict)
        and len(rows) == facts["table_count"]
        and all(isinstance(name, str) and name and type(value) is int and value >= 0 for name, value in rows.items())
        and sum(rows.values()) == facts["total_row_count"]
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_backup_restore(config: Config, source_password: str, target_password: str, runner: CommandRunner | None = None) -> tuple[Path, Path, dict[str, Any]]:
    runner = runner or CommandRunner()
    for label, value in (
        ("source container", config.source_container),
        ("source database", config.source_database),
        ("source user", config.source_user),
        ("target container", config.target_container),
        ("target user", config.target_user),
        ("approved target container", config.approved_target_container),
    ):
        _safe_name(value, label)
    if config.source_container == config.target_container:
        raise VerifyError("source and target containers must be distinct")
    if config.approved_target_container != config.target_container:
        raise VerifyError("disposable target approval must exactly match target container")
    config.output_dir.mkdir(parents=True, exist_ok=True)
    if not config.output_dir.is_dir():
        raise VerifyError("output path is not a directory")
    token = uuid4().hex
    temporary_database = f"perum_restore_verify_{token}"
    source_pgpass = f"/tmp/perum_pgpass_{token}_source"
    target_pgpass = f"/tmp/perum_pgpass_{token}_target"
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup_path = config.output_dir / f"backup-{timestamp}-{token}.dump"
    manifest_path = backup_path.with_name(f"{backup_path.name}.manifest.json")
    installed: list[tuple[str, str]] = []
    source_session: CommandSession | None = None
    database_created = False
    primary_error: BaseException | None = None
    result: tuple[Path, Path, dict[str, Any]] | None = None
    try:
        _install_pgpass(runner, config.source_container, source_pgpass, config.source_user, source_password)
        installed.append((config.source_container, source_pgpass))
        _install_pgpass(runner, config.target_container, target_pgpass, config.target_user, target_password)
        installed.append((config.target_container, target_pgpass))
        source_session, snapshot, source_facts = _snapshot_facts(runner, config.source_container, source_pgpass, config.source_user, config.source_database)
        descriptor = os.open(backup_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as output:
                runner.run(_docker(config.source_container, source_pgpass, ["pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--snapshot", snapshot, "--username", config.source_user, "--dbname", config.source_database]), output=output)
        except Exception:
            backup_path.unlink(missing_ok=True)
            raise
        source_session.close()
        source_session = None
        checksum = _sha256(backup_path)
        manifest = {
            "manifest_version": 2,
            "backup_file": backup_path.name,
            "format": "pg_dump-custom",
            "sha256": checksum,
            "source_facts": source_facts,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.chmod(manifest_path, 0o600)
        database_created = True
        runner.run(_docker(config.target_container, target_pgpass, ["createdb", "--username", config.target_user, "--template", "template0", temporary_database]))
        with backup_path.open("rb") as backup:
            command = _docker(config.target_container, target_pgpass, ["pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "--username", config.target_user, "--dbname", temporary_database], interactive=True)
            runner.run(command, input_stream=backup)
        restored_facts = _facts(runner, config.target_container, target_pgpass, config.target_user, temporary_database)
        if restored_facts != source_facts:
            raise VerifyError("restored aggregate facts do not match source")
        result = backup_path, manifest_path, restored_facts
    except BaseException as exc:
        primary_error = exc
    cleanup_errors: list[Exception] = []
    if source_session is not None:
        try:
            source_session.close()
        except Exception as exc:
            cleanup_errors.append(exc)
    if database_created:
        try:
            runner.run(_docker(config.target_container, target_pgpass, ["dropdb", "--force", "--if-exists", "--username", config.target_user, temporary_database]))
        except Exception as exc:
            cleanup_errors.append(exc)
    for container, path in reversed(installed):
        try:
            _remove_pgpass(runner, container, path)
        except Exception as exc:
            cleanup_errors.append(exc)
    if cleanup_errors:
        raise VerifyError("cleanup failed; operator intervention is required") from cleanup_errors[0]
    if primary_error is not None:
        raise primary_error
    if result is None:
        raise VerifyError("verification failed closed")
    return result


def check_backup(backup_path: Path, manifest_path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise VerifyError("invalid manifest") from exc
    expected_keys = {"manifest_version", "backup_file", "format", "sha256", "source_facts"}
    if not isinstance(manifest, dict) or set(manifest) != expected_keys:
        raise VerifyError("invalid manifest fields")
    facts = manifest["source_facts"]
    if manifest["manifest_version"] != 2 or manifest["backup_file"] != backup_path.name or manifest["format"] != "pg_dump-custom":
        raise VerifyError("manifest does not describe this backup")
    if not isinstance(manifest["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", manifest["sha256"]):
        raise VerifyError("invalid manifest checksum")
    if not _valid_facts(facts):
        raise VerifyError("invalid manifest facts")
    try:
        actual_checksum = _sha256(backup_path)
    except OSError as exc:
        raise VerifyError("could not read backup") from exc
    if actual_checksum != manifest["sha256"]:
        raise VerifyError("backup checksum mismatch")
    return facts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Operator-only PostgreSQL backup/restore verifier")
    parser.add_argument("--source-container")
    parser.add_argument("--source-database")
    parser.add_argument("--source-user")
    parser.add_argument("--target-container")
    parser.add_argument("--target-user")
    parser.add_argument("--approve-target-container")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--password-file", type=Path)
    parser.add_argument("--target-password-file", type=Path)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.check_only:
            if not args.backup:
                parser.error("--backup is required with --check-only")
            manifest_path = args.manifest or args.backup.with_name(f"{args.backup.name}.manifest.json")
            facts = check_backup(args.backup, manifest_path)
            print(json.dumps({"backup": str(args.backup), "status": "valid", **facts}, sort_keys=True))
            return 0
        required = ("source_container", "source_database", "source_user", "target_container", "target_user", "output_dir", "approve_target_container")
        missing = [f"--{name.replace('_', '-')}" for name in required if getattr(args, name) is None]
        if missing:
            parser.error(f"required arguments: {', '.join(missing)}")
        source_password = _password("PERUM_PG_PASSWORD", args.password_file)
        target_password = _password("PERUM_TARGET_PG_PASSWORD", args.target_password_file, source_password)
        config = Config(args.source_container, args.source_database, args.source_user, args.target_container, args.target_user, args.output_dir, args.approve_target_container)
        backup, manifest, facts = verify_backup_restore(config, source_password, target_password)
        print(json.dumps({"backup": str(backup), "manifest": str(manifest), "status": "verified", **facts}, sort_keys=True))
        return 0
    except VerifyError as exc:
        print(f"verification failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
