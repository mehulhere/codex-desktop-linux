import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("webview-cache.py")
SPEC = importlib.util.spec_from_file_location("webview_cache", MODULE_PATH)
webview_cache = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(webview_cache)


class WebviewCacheFingerprintTests(unittest.TestCase):
    def test_webview_asset_changes_invalidate_the_fingerprint(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            app_dir = Path(temporary_directory)
            (app_dir / "resources").mkdir()
            (app_dir / "content" / "webview" / "assets").mkdir(parents=True)
            (app_dir / "resources" / "app.asar").write_bytes(b"app")
            (app_dir / "content" / "webview" / "index.html").write_text("index")
            asset = app_dir / "content" / "webview" / "assets" / "app-main.js"
            asset.write_text("re.call")

            before = webview_cache.installed_build_fingerprint(app_dir)
            asset.write_text("Object.prototype.hasOwnProperty.call")
            after = webview_cache.installed_build_fingerprint(app_dir)

            self.assertNotEqual(before, after)


if __name__ == "__main__":
    unittest.main()
