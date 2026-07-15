import hashlib
import os
import secrets
from pathlib import Path
from typing import Protocol


class ChunkSource(Protocol):
    async def read(self, size: int = -1) -> bytes: ...


class LocalPrivateStorage:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.quarantine = self.root / "quarantine"
        self.clean = self.root / "clean"
        for directory in (self.root, self.quarantine, self.clean):
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.chmod(directory, 0o700)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if path != self.root and self.root not in path.parents:
            raise ValueError("invalid storage key")
        return path

    def allocate_quarantine(self) -> tuple[str, Path]:
        token = secrets.token_hex(24)
        key = f"quarantine/{token[:2]}/{token[2:]}"
        path = self._path(key)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(path.parent, 0o700)
        return key, path

    async def write(self, source: ChunkSource, max_bytes: int) -> tuple[str, int, bytes]:
        key, path = self.allocate_quarantine()
        digest = hashlib.sha256()
        size = 0
        prefix = bytearray()
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as target:
                while chunk := await source.read(64 * 1024):
                    size += len(chunk)
                    if size > max_bytes:
                        raise ValueError("file too large")
                    if len(prefix) < 16:
                        prefix.extend(chunk[:16 - len(prefix)])
                    digest.update(chunk)
                    target.write(chunk)
            os.chmod(path, 0o600)
            return key, size, bytes(prefix) + digest.digest()
        except BaseException:
            path.unlink(missing_ok=True)
            raise

    def path(self, key: str) -> Path:
        return self._path(key)

    def promote(self, key: str) -> str:
        source = self._path(key)
        token = secrets.token_hex(24)
        clean_key = f"clean/{token[:2]}/{token[2:]}"
        target = self._path(clean_key)
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(target.parent, 0o700)
        os.replace(source, target)
        os.chmod(target, 0o600)
        return clean_key

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()
