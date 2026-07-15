#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile


CACHE_NAMES = ("Cache", "Code Cache", "Service Worker")
MARKER_NAME = "webview-cache-fingerprint-v1"


def absolute_directory(value: str, label: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        raise ValueError(f"{label} must be an absolute path")
    resolved = path.resolve()
    if resolved == Path(resolved.anchor):
        raise ValueError(f"{label} must not be a filesystem root")
    return resolved


def installed_build_fingerprint(app_dir: Path) -> str:
    build_info = app_dir / "resources" / "codex-linux-build-info.json"
    digest = hashlib.sha256()
    if build_info.is_file():
        digest.update(b"build-info-v1\0")
        digest.update(build_info.read_bytes())
        return digest.hexdigest()

    metadata = []
    for relative_path in ("resources/app.asar", "content/webview/index.html"):
        path = app_dir / relative_path
        if path.is_file():
            stat = path.stat()
            metadata.append(
                {
                    "path": relative_path,
                    "size": stat.st_size,
                    "mtimeNs": stat.st_mtime_ns,
                }
            )
        else:
            metadata.append({"path": relative_path, "missing": True})
    webview_assets_root = app_dir / "content" / "webview" / "assets"
    if webview_assets_root.is_dir():
        for path in sorted(webview_assets_root.rglob("*")):
            if not path.is_file():
                continue
            stat = path.stat()
            metadata.append(
                {
                    "path": str(path.relative_to(app_dir)),
                    "size": stat.st_size,
                    "mtimeNs": stat.st_mtime_ns,
                }
            )
    digest.update(b"installed-files-v1\0")
    digest.update(json.dumps(metadata, sort_keys=True, separators=(",", ":")).encode())
    return digest.hexdigest()


def remove_disposable_caches(user_data_dir: Path) -> None:
    for cache_name in CACHE_NAMES:
        cache_path = user_data_dir / cache_name
        if cache_path.is_symlink() or cache_path.is_file():
            cache_path.unlink()
        elif cache_path.is_dir():
            shutil.rmtree(cache_path)


def write_marker(marker_path: Path, fingerprint: str) -> None:
    marker_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=marker_path.parent,
        prefix=f".{marker_path.name}.",
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf8") as temporary_file:
            temporary_file.write(fingerprint + "\n")
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_name, marker_path)
    finally:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass


def invalidate_if_changed(app_dir: Path, state_dir: Path, user_data_dir: Path) -> str:
    fingerprint = installed_build_fingerprint(app_dir)
    marker_path = state_dir / MARKER_NAME
    previous = marker_path.read_text(encoding="utf8").strip() if marker_path.is_file() else None
    if previous == fingerprint:
        return "unchanged"

    remove_disposable_caches(user_data_dir)
    write_marker(marker_path, fingerprint)
    return "cleared"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Invalidate stale Codex webview caches")
    parser.add_argument("--app-dir", required=True)
    parser.add_argument("--state-dir", required=True)
    parser.add_argument("--user-data-dir", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        app_dir = absolute_directory(args.app_dir, "app directory")
        state_dir = absolute_directory(args.state_dir, "state directory")
        user_data_dir = absolute_directory(args.user_data_dir, "user-data directory")
        result = invalidate_if_changed(app_dir, state_dir, user_data_dir)
    except (OSError, ValueError) as error:
        print(f"WARN: webview cache invalidation failed: {error}", file=sys.stderr)
        return 1

    print(f"Webview cache fingerprint {result}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
