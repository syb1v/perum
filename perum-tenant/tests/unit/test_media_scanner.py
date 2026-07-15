import asyncio

from app.modules.media.scanner import FakeScanner, MediaScanner, UnavailableScanner


def test_generic_scanners_fail_closed_and_return_test_verdicts(tmp_path):
    async def run():
        path = tmp_path / "sample"
        path.write_bytes(b"content")

        scanners: list[MediaScanner] = [UnavailableScanner(), FakeScanner("clean"), FakeScanner("infected")]
        verdicts = [await scanner.scan(path) for scanner in scanners]

        assert [(verdict.verdict, verdict.scanner) for verdict in verdicts] == [
            ("unavailable", "unavailable"),
            ("clean", "fake"),
            ("infected", "fake"),
        ]

    asyncio.run(run())
