"""Exercise release failure/recovery without a Docker daemon or real secrets."""
import json
import fcntl
import time
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/"deploy/digitalocean/rollout.sh"
COMPONENT="frontend"
SERVICE="api" if COMPONENT=="backend" else "web"
REPOSITORY="ghcr.io/vitaliilatysh/"+("quizproject" if COMPONENT=="backend" else "quizproject-web")
IMAGE=REPOSITORY+"@sha256:"+"a"*64


class RolloutTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base=Path(self.temp.name)
        self.root=self.base/"production"/COMPONENT
        self.root.mkdir(parents=True)
        (self.root/".env").write_text("MYSQL_PASSWORD=test-only-secret\n")
        (self.root/".env").chmod(0o600)
        self.log=self.base/"calls.jsonl"
        self.bin=self.base/"bin"
        self.bin.mkdir()
        fake=self.bin/"docker"
        fake.write_text("""#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
args=sys.argv[1:]
with open(os.environ["FAKE_LOG"],"a") as handle: handle.write(json.dumps(args)+"\\n")
release=Path(args[args.index("--file")+1]).parent.name
command=args[args.index("--file")+2]
if release=="2-1" and command==os.environ.get("FAKE_FAIL"): sys.exit(1)
""")
        fake.chmod(0o700)
        self.env={**os.environ,"PATH":str(self.bin)+os.pathsep+os.environ["PATH"],
                  "QUIZ_DEPLOY_ROOT":str(self.base),"FAKE_LOG":str(self.log)}
        self.release=self.make_release("2-1")

    def make_release(self,name):
        directory=self.root/"releases"/name
        directory.mkdir(parents=True)
        shutil.copyfile(SOURCE,directory/"rollout.sh")
        (directory/"compose.yaml").write_text("services: {}\n")
        (directory/"image.env").write_text("APP_IMAGE="+IMAGE+"\nDEPLOY_ENV=production\n")
        return directory

    def run_release(self,image=IMAGE):
        return subprocess.run(["bash",str(self.release/"rollout.sh"),COMPONENT,"production",image],
                              env=self.env,text=True,capture_output=True,timeout=10)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def previous(self):
        previous=self.make_release("1-1")
        (self.root/"current").symlink_to(previous)
        return previous

    def test_success_activates_only_after_health_checks_without_logging_secrets(self):
        result=self.run_release()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.root/"current").resolve(),self.release)
        calls=self.calls()
        self.assertIn("--quiet",calls[0])
        self.assertEqual(calls[1][-2:],["pull",SERVICE])
        self.assertIn("--wait",calls[2])
        self.assertNotIn("test-only-secret",result.stdout+result.stderr+json.dumps(calls))
        self.assertEqual((self.release/"image.env").stat().st_mode & 0o777,0o600)

    def test_host_lock_prevents_a_second_repository_from_mutating_the_stack(self):
        with (self.base / "production/.deploy.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            process = subprocess.Popen(["bash", str(self.release / "rollout.sh"), COMPONENT, "production", IMAGE],
                                       env=self.env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                time.sleep(0.15)
                self.assertEqual(self.calls(), [])
                self.assertIsNone(process.poll())
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)
                stdout, stderr = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, stderr)

    def test_failed_start_restores_previous_release(self):
        previous=self.previous()
        self.env["FAKE_FAIL"]="up"
        result=self.run_release()
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.root/"current").resolve(),previous)
        up=[c for c in self.calls() if "up" in c]
        self.assertEqual(len(up),2)
        self.assertIn(str(previous/"compose.yaml"),up[1])
        self.assertIn("--wait",up[1])
        self.assertFalse(any("down" in c or "--volumes" in c for c in self.calls()))

    def test_pull_failure_does_not_touch_running_release(self):
        previous=self.previous()
        self.env["FAKE_FAIL"]="pull"
        self.assertNotEqual(self.run_release().returncode,0)
        self.assertEqual((self.root/"current").resolve(),previous)
        self.assertFalse(any("up" in c for c in self.calls()))

    def test_first_failure_preserves_data_and_has_no_false_rollback(self):
        self.env["FAKE_FAIL"]="up"
        result=self.run_release()
        self.assertNotEqual(result.returncode,0)
        self.assertFalse((self.root/"current").exists())
        self.assertIn("Data volumes are preserved",result.stderr)
        self.assertEqual(len([c for c in self.calls() if "up" in c]),1)

    def test_mutable_and_foreign_registry_images_are_rejected_before_docker(self):
        for image in (REPOSITORY+":main",IMAGE.replace("ghcr.io","ghcrXio"),IMAGE+";false"):
            with self.subTest(image=image):
                self.assertNotEqual(self.run_release(image).returncode,0)
                self.assertEqual(self.calls(),[])

    def test_missing_or_world_readable_credentials_block_deployment(self):
        (self.root/".env").chmod(0o644)
        self.assertNotEqual(self.run_release().returncode,0)
        (self.root/".env").unlink()
        self.assertNotEqual(self.run_release().returncode,0)
        self.assertEqual(self.calls(),[])

    def test_symlinked_current_outside_release_directory_is_rejected(self):
        (self.root/"current").symlink_to(self.base)
        self.assertNotEqual(self.run_release().returncode,0)
        self.assertEqual(self.calls(),[])


if __name__=="__main__":
    unittest.main()
