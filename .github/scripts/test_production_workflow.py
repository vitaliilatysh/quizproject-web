"""Keep the production policy wired before any cluster mutation."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ProductionWorkflowTest(unittest.TestCase):
    def test_production_gate_checks_signed_image_and_manifests_before_apply(self):
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")
        steps = workflow.split("      - name: ")
        gate = next(step for step in steps if step.startswith("Require successful checks before production\n"))
        self.assertIn("if: env.OVERLAY == 'production'", gate)
        self.assertIn("GH_TOKEN: ${{ github.token }}", gate)
        self.assertIn("org.opencontainers.image.revision", gate)
        self.assertIn('"${DIGEST_REF}"', gate)
        self.assertIn("--repo \"${GITHUB_REPOSITORY}\" --branch main", gate)
        self.assertIn('--sha "${IMAGE_SHA}" --sha "${DEPLOY_SHA}"', gate)
        self.assertEqual(["ci.yml","sonarqube.yml","container.yml","e2e.yml"], re.findall(r"--workflow (\S+)", gate))
        self.assertIn("  actions: read\n", workflow)
        self.assertLess(workflow.index("Verify the image signature"), workflow.index(gate))
        self.assertLess(workflow.index(gate), workflow.index("kubectl apply"))

    def test_staging_trigger_keeps_its_existing_trust_boundary(self):
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")
        self.assertIn("github.event.workflow_run.event == 'push'", workflow)
        self.assertIn("github.event.workflow_run.head_repository.full_name == github.repository", workflow)
        self.assertIn("branches: [main]", workflow)

    def test_published_images_include_the_revision_required_by_the_gate(self):
        workflow = (ROOT / ".github/workflows/container.yml").read_text(encoding="utf-8")
        publish = next(step for step in workflow.split("      - name: ")
                       if step.startswith("Build and publish multi-platform image\n"))
        self.assertIn("          labels: |\n            org.opencontainers.image.revision=${{ github.sha }}\n", publish)

    def test_container_ci_checks_the_actual_image_revision_label(self):
        workflow = (ROOT / ".github/workflows/container.yml").read_text(encoding="utf-8")
        steps = workflow.split("      - name: ")
        build = next(step for step in steps if step.startswith("Build test image\n"))
        check = next(step for step in steps if step.startswith("Verify the image source revision\n"))
        self.assertIn('--label "org.opencontainers.image.revision=${GITHUB_SHA}"', build)
        self.assertIn('docker inspect --format', check)
        self.assertIn('org.opencontainers.image.revision', check)
        self.assertIn('quizproject-web:test', check)
        self.assertIn('test "${IMAGE_SHA}" = "${GITHUB_SHA}"', check)
        self.assertLess(workflow.index(build), workflow.index(check))
        self.assertLess(workflow.index(check), workflow.index("Run container smoke test"))

    def test_ci_runs_the_policy_tests(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        self.assertIn("python3 -B -m unittest discover -s .github/scripts -v", workflow)


if __name__ == "__main__":
    unittest.main()
