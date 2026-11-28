"""Check HTTPS activation and rollback without production credentials or a CA."""
import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("configure_https", ROOT / "deploy/digitalocean/configure-https.py")
HTTPS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HTTPS)
HOST = "164.92.163.71"


class HttpsTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.before = {}
        for component in ("backend", "frontend"):
            folder = self.root / "production" / component
            release = folder / "releases/1-1"
            release.mkdir(parents=True)
            (folder / "current").symlink_to(release)
            text = "PASSWORD='private-value$#'\n" + ("PUBLIC_ORIGIN=http://" + HOST + "\n" if component == "backend" else "SITE_ADDRESS=http://:80\n")
            HTTPS.private_write(folder / ".env", text)
            self.before[folder / ".env"] = text
            HTTPS.private_write(release / "image.env", "APP_IMAGE=verified\nDEPLOY_ENV=production\n")
            (release / "compose.yaml").write_text("TLS_SERVER_NAME\n")
            (release / "Caddyfile").write_text("profile shortlived\nTLS_SERVER_NAME\n")
        self.calls = []
        def command(arguments):
            self.calls.append(arguments)
            if arguments[-2:] == ["caddy", "version"]:
                return "v2.11.9"
            if arguments[-3:] == ["ps", "--quiet", "edge"]:
                return "a" * 64
            return ""
        self.command = patch.object(HTTPS, "command", side_effect=command)
        self.command.start()
        self.addCleanup(self.command.stop)

    def configure(self, mode="enable", operation="2-1", host=HOST):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            HTTPS.configure(self.root, host, mode, operation)
        return output.getvalue()

    def test_inspection_does_not_write_or_restart(self):
        self.assertIn("v2.11.9", self.configure("inspect"))
        for path, text in self.before.items():
            self.assertEqual(path.read_text(), text)
        self.assertFalse(any("up" in call for call in self.calls))
        self.assertFalse((self.root / "production/https-backups").exists())

    def test_success_preserves_credentials_images_and_private_backup(self):
        with patch.object(HTTPS, "wait_tls", return_value={"tls_verified": True}):
            output = self.configure()
        self.assertNotIn("private-value", output)
        for path, old in self.before.items():
            self.assertIn("PASSWORD='private-value$#'\n", path.read_text())
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            backup = self.root / "production/https-backups/2-1" / (path.parent.name + ".env")
            self.assertEqual(backup.read_text(), old)
            self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        up = [call for call in self.calls if "up" in call]
        self.assertEqual([call[-1] for call in up], ["api", "edge"])
        self.assertTrue(all("--no-deps" in call and "--wait" in call for call in up))
        self.assertFalse(any(word in call for call in self.calls for word in ("pull", "down", "--volumes")))
        self.assertIn("TLS_SERVER_NAME=" + HOST, (self.root / "production/frontend/.env").read_text())

    def test_failed_certificate_restores_both_environments_and_services(self):
        with patch.object(HTTPS, "wait_tls", side_effect=RuntimeError("not trusted")):
            with self.assertRaisesRegex(RuntimeError, "previous public settings were restored"):
                self.configure()
        for path, old in self.before.items():
            self.assertEqual(path.read_text(), old)
        self.assertEqual([call[-1] for call in self.calls if "up" in call], ["api", "edge", "api", "edge"])

    def test_existing_backend_project_is_adopted(self):
        marker = self.root / "production/backend/.compose-project"
        HTTPS.private_write(marker, "quizproject\n")
        with patch.object(HTTPS, "wait_tls", return_value={}):
            self.configure()
        api_call = next(call for call in self.calls if call[-1] == "api")
        self.assertEqual(api_call[api_call.index("--project-name") + 1], "quizproject")

    def test_invalid_host_or_operation_cannot_reach_docker(self):
        for host, operation in [("127.0.0.1", "2-1"), ("10.1.1.1", "2-1"), ("example.com", "2-1"), (HOST, "../other")]:
            with self.subTest(host=host), self.assertRaises(ValueError):
                self.configure(host=host, operation=operation)
        self.assertEqual(self.calls, [])

    def test_public_or_symlinked_secret_files_are_rejected(self):
        path = self.root / "production/backend/.env"
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            self.configure()
        path.unlink()
        path.symlink_to(self.root / "production/frontend/.env")
        with self.assertRaises(ValueError):
            self.configure()
        self.assertEqual(self.calls, [])

    def test_old_proxy_configuration_cannot_change_environment(self):
        (self.root / "production/frontend/releases/1-1/Caddyfile").write_text("old bootstrap")
        with self.assertRaisesRegex(ValueError, "Deploy the IP HTTPS"):
            self.configure()
        for path, old in self.before.items():
            self.assertEqual(path.read_text(), old)

    def test_repeating_successful_setup_does_not_restart_or_issue_again(self):
        with patch.object(HTTPS, "wait_tls", return_value={}):
            self.configure()
        self.calls.clear()
        with patch.object(HTTPS, "trusted_tls", return_value={"tls_verified": True}):
            self.configure(operation="3-1")
        self.assertFalse(any("up" in call for call in self.calls))
        self.assertFalse((self.root / "production/https-backups/3-1").exists())

    def test_duplicate_public_settings_are_rejected(self):
        with self.assertRaises(ValueError):
            HTTPS.replace_settings("PUBLIC_ORIGIN=first\nPUBLIC_ORIGIN=second\n", {"PUBLIC_ORIGIN": "https://" + HOST})

    def test_external_verification_can_restore_the_private_snapshot(self):
        with patch.object(HTTPS, "wait_tls", return_value={}):
            self.configure()
        self.calls.clear()
        self.configure(mode="rollback")
        for path, old in self.before.items():
            self.assertEqual(path.read_text(), old)
        self.assertEqual([call[-1] for call in self.calls if "up" in call], ["api", "edge"])

    def test_unsupported_caddy_cannot_change_environment(self):
        original = HTTPS.command.side_effect
        def old_version(arguments):
            return "v2.10.2" if arguments[-2:] == ["caddy", "version"] else original(arguments)
        HTTPS.command.side_effect = old_version
        with self.assertRaisesRegex(ValueError, "Caddy 2.11"):
            self.configure()
        for path, old in self.before.items():
            self.assertEqual(path.read_text(), old)

    def test_external_rollback_recovers_without_a_running_proxy(self):
        with patch.object(HTTPS, "wait_tls", return_value={}):
            self.configure()
        self.calls.clear()
        def unavailable_proxy(arguments):
            if "ps" in arguments or "exec" in arguments:
                raise RuntimeError("The proxy is unavailable")
            self.calls.append(arguments)
            return ""
        with patch.object(HTTPS, "command", side_effect=unavailable_proxy):
            self.configure(mode="rollback")
        for path, old in self.before.items():
            self.assertEqual(path.read_text(), old)
        self.assertEqual([call[-1] for call in self.calls], ["api", "edge"])


if __name__ == "__main__":
    unittest.main()
