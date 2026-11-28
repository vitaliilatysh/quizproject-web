#!/usr/bin/env python3
"""Enable trusted IP HTTPS on an existing stack, preserving private credentials."""
import argparse
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import time


DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]
CLEAN_ENV = {"APP_IMAGE", "DEPLOY_ENV", "PUBLIC_ORIGIN", "SITE_ADDRESS", "TLS_SERVER_NAME",
             "HTTP_PORT", "HTTPS_PORT", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS",
             "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"}


def read_private(path):
    info = path.lstat()
    if not path.is_file() or path.is_symlink() or info.st_mode & 0o077:
        raise ValueError("Deployment state must be a private regular file.")
    return path.read_text()


def replace_settings(text, values):
    lines = text.splitlines(keepends=True)
    for key, value in values.items():
        positions = [i for i, line in enumerate(lines) if line.startswith(key + "=")]
        if len(positions) > 1:
            raise ValueError("Duplicate public deployment setting.")
        if positions:
            lines[positions[0]] = f"{key}={value}\n"
        else:
            if lines and not lines[-1].endswith("\n"):
                lines[-1] += "\n"
            lines.append(f"{key}={value}\n")
    return "".join(lines)


def private_write(path, text):
    fd, temporary = tempfile.mkstemp(prefix=".https-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(text)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def command(arguments):
    completed = subprocess.run(arguments, capture_output=True, text=True, timeout=240,
                               env={k: v for k, v in os.environ.items() if k not in CLEAN_ENV})
    if completed.returncode:
        # Compose errors can include resolved credentials; never forward its output.
        raise RuntimeError("Docker operation failed; private command output was suppressed.")
    return completed.stdout.strip()


def deployment(base, component):
    root = base / component
    current = root / "current"
    release = current.resolve(strict=True)
    if not current.is_symlink() or release.parent != (root / "releases").resolve(strict=True):
        raise ValueError("Current release must point inside this component's releases.")
    read_private(root / ".env")
    read_private(release / "image.env")
    project = "quizproject-production-" + component
    marker = root / ".compose-project"
    if marker.exists() or marker.is_symlink():
        value = read_private(marker).strip()
        if component != "backend" or value not in ("quizproject", project):
            raise ValueError("Unexpected Compose project marker.")
        project = value
    arguments = DOCKER + ["compose", "--project-name", project, "--env-file", str(root / ".env"),
                         "--env-file", str(release / "image.env"), "--file", str(release / "compose.yaml")]
    return root, release, arguments


def restart(arguments, service):
    command(arguments + ["up", "--detach", "--wait", "--wait-timeout", "180", "--no-deps", service])


def trusted_tls(host):
    context = ssl.create_default_context()
    with socket.create_connection(("127.0.0.1", 443), timeout=5) as connection:
        with context.wrap_socket(connection, server_hostname=host) as stream:
            certificate = stream.getpeercert()
            stream.sendall(f"GET /healthz HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n".encode())
            status = stream.recv(4096).split(b"\r\n", 1)[0].split()
            if len(status) < 2 or status[1] != b"200":
                raise RuntimeError("TLS listener did not return a healthy response.")
    return {"host": host, "expires_at": certificate["notAfter"], "tls_verified": True}


def wait_tls(host, seconds=180):
    deadline = time.monotonic() + seconds
    while True:
        try:
            return trusted_tls(host)
        except (OSError, ValueError, RuntimeError):
            if time.monotonic() >= deadline:
                raise RuntimeError("A publicly trusted IP certificate did not become ready.") from None
            time.sleep(2)


def interrupted(_signum, _frame):
    raise RuntimeError("HTTPS setup was interrupted.")


def configure(root, host, mode, operation):
    address = ipaddress.IPv4Address(host)
    if not address.is_global or str(address) != host:
        raise ValueError("Use the Droplet's canonical public IPv4 address.")
    if not re.fullmatch(r"[0-9]+-[0-9]+", operation):
        raise ValueError("Expected a GitHub run-attempt operation ID.")
    base = root.resolve(strict=True) / "production"
    with (base / ".deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        backend, backend_release, backend_args = deployment(base, "backend")
        frontend, frontend_release, frontend_args = deployment(base, "frontend")
        # Recovery must not depend on the proxy that may have just failed.
        if mode == "rollback":
            backup = base / "https-backups" / operation
            previous = {backend / ".env": read_private(backup / "backend.env"),
                        frontend / ".env": read_private(backup / "frontend.env")}
            for path, text in previous.items():
                private_write(path, text)
            restart(backend_args, "api")
            restart(frontend_args, "edge")
            print("Previous public settings restored after external verification failure.")
            return
        edge = command(frontend_args + ["ps", "--quiet", "edge"])
        if not re.fullmatch(r"[0-9a-f]{12,64}", edge):
            raise ValueError("Expected one running edge container.")
        version = command(DOCKER + ["exec", edge, "caddy", "version"])
        match = re.match(r"v(\d+)\.(\d+)\.", version)
        if not match or tuple(map(int, match.groups())) < (2, 11):
            raise ValueError("Trusted IP certificates require Caddy 2.11 or newer.")
        if mode == "inspect":
            print(json.dumps({"caddy_version": version, "backend_release": backend_release.name,
                              "frontend_release": frontend_release.name, "host": host}))
            return
        origin = "https://" + host
        old = {backend / ".env": read_private(backend / ".env"), frontend / ".env": read_private(frontend / ".env")}
        candidate = {
            backend / ".env": replace_settings(old[backend / ".env"], {"PUBLIC_ORIGIN": origin}),
            frontend / ".env": replace_settings(old[frontend / ".env"], {
                "SITE_ADDRESS": origin, "TLS_SERVER_NAME": host, "HTTP_PORT": "80", "HTTPS_PORT": "443"}),
        }
        if candidate == old:
            print(json.dumps(trusted_tls(host)))
            return
        caddyfile = (frontend_release / "Caddyfile").read_text()
        if "profile shortlived" not in caddyfile or "TLS_SERVER_NAME" not in caddyfile:
            raise ValueError("Deploy the IP HTTPS frontend configuration first.")
        if "TLS_SERVER_NAME" not in (frontend_release / "compose.yaml").read_text():
            raise ValueError("Deploy the updated edge environment first.")
        # Keep the last private environment files for operator recovery, not Actions artifacts.
        backups = base / "https-backups"
        if backups.is_symlink():
            raise ValueError("HTTPS backups must remain in the production directory.")
        backups.mkdir(mode=0o700, exist_ok=True)
        backups.chmod(0o700)
        backup = backups / operation
        backup.mkdir(mode=0o700)
        for path, text in old.items():
            private_write(backup / (path.parent.name + ".env"), text)
        handlers = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM)}
        try:
            for path, text in candidate.items():
                private_write(path, text)
            command(backend_args + ["config", "--quiet"])
            command(frontend_args + ["config", "--quiet"])
            restart(backend_args, "api")
            restart(frontend_args, "edge")
            result = wait_tls(host)
        except Exception:
            for path, text in old.items():
                private_write(path, text)
            try:
                restart(backend_args, "api")
                restart(frontend_args, "edge")
            except Exception:
                raise RuntimeError("HTTPS setup and rollback failed; inspect the Droplet.") from None
            raise RuntimeError("HTTPS setup failed; previous public settings were restored.") from None
        finally:
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
        print(json.dumps({**result, "origin": origin, "credentials_preserved": True}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/opt/quizproject"))
    parser.add_argument("--host", required=True)
    parser.add_argument("--mode", choices=("inspect", "enable", "rollback"), default="inspect")
    parser.add_argument("--operation", required=True)
    arguments = parser.parse_args()
    try:
        configure(arguments.root, arguments.host, arguments.mode, arguments.operation)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
