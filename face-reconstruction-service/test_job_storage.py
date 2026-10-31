import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import app as service
from job_storage import MANIFEST, REQUIRED, head_bundle, job_directory, recover_job, write_job


class SavedHeadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.job_id = "a" * 32
        self.directory = self.root / self.job_id
        self.output = self.directory / "output"
        self.output.mkdir(parents=True)
        manifest = {"status": "success", "detail_maps": {"albedo": "skin.png"}}
        for key in REQUIRED:
            name = key + (".obj" if key == "neutral_base_obj" else ".json")
            manifest[key] = name
            (self.output / name).write_text("head asset")
        (self.output / "skin.png").write_bytes(b"texture")
        (self.output / MANIFEST).write_text(json.dumps(manifest))
        self.manifest = manifest
        self.root_patch = patch.object(service, "WORK_ROOT", self.root)
        self.token_patch = patch.object(service, "API_TOKEN", "private-test-token")
        self.root_patch.start()
        self.token_patch.start()
        service._jobs.clear()
        self.client = TestClient(service.app)
        self.headers = {"X-Face-Reconstruction-Token": "private-test-token"}

    def tearDown(self):
        self.root_patch.stop()
        self.token_patch.stop()
        service._jobs.clear()
        self.temp.cleanup()

    def test_legacy_completed_head_recovers_without_in_memory_job(self):
        response = self.client.get(f"/v1/reconstructions/{self.job_id}", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "complete")
        response = self.client.get(f"/v1/reconstructions/{self.job_id}/assets/skin.png", headers=self.headers)
        self.assertEqual(response.content, b"texture")

    def test_atomic_state_round_trip_and_restart(self):
        write_job(self.directory, {"status": "complete", "message": "ready", "logs": ["exported"]})
        self.assertFalse((self.directory / "job.json.tmp").exists())
        self.assertEqual(recover_job(self.root, self.job_id)["logs"], ["exported"])
        service._jobs.clear()
        self.assertEqual(self.client.get(f"/v1/reconstructions/{self.job_id}/assets/{MANIFEST}", headers=self.headers).status_code, 200)

    def test_interrupted_job_fails_instead_of_polling_forever(self):
        (self.output / MANIFEST).unlink()
        write_job(self.directory, {"status": "running", "message": "working"})
        response = self.client.get(f"/v1/reconstructions/{self.job_id}", headers=self.headers)
        self.assertEqual(response.json()["status"], "failed")
        self.assertIn("interrupted", response.json()["message"])

    def test_failed_job_retains_its_error(self):
        (self.output / MANIFEST).unlink()
        write_job(self.directory, {"status": "failed", "message": "Missing model"})
        self.assertEqual(recover_job(self.root, self.job_id)["message"], "Missing model")

    def test_corrupt_state_can_recover_valid_legacy_output(self):
        (self.directory / "job.json").write_text("{truncated")
        self.assertEqual(recover_job(self.root, self.job_id)["status"], "complete")

    def test_missing_required_asset_never_becomes_complete(self):
        (self.output / self.manifest["blendshapes_json"]).unlink()
        self.assertEqual(recover_job(self.root, self.job_id)["status"], "failed")
        self.assertEqual(self.client.get(f"/v1/reconstructions/{self.job_id}/assets/skin.png", headers=self.headers).status_code, 409)

    def test_unknown_and_invalid_job_ids(self):
        self.assertIsNone(recover_job(self.root, "b" * 32))
        for job_id in ("..", "xyz", "A" * 32, "a" * 31, "a" * 33):
            with self.assertRaises(ValueError):
                job_directory(self.root, job_id)

    def test_authentication_required_even_after_restart(self):
        for headers in ({}, {"X-Face-Reconstruction-Token": "wrong"}):
            response = self.client.get(f"/v1/reconstructions/{self.job_id}/assets/avatarace_head_bundle.zip", headers=headers)
            self.assertEqual(response.status_code, 401)
        self.assertFalse(service._jobs)

    def test_zip_is_manifest_bounded_no_photos_logs_or_unlisted_files(self):
        (self.output / "secret.png").write_text("not published")
        (self.directory / "input").mkdir()
        (self.directory / "input" / "photo.jpg").write_text("private")
        response = self.client.get(f"/v1/reconstructions/{self.job_id}/assets/avatarace_head_bundle.zip", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "no-store")
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(set(archive.namelist()), {MANIFEST, "skin.png", *(self.manifest[key] for key in REQUIRED)})
        self.assertEqual(self.client.get(f"/v1/reconstructions/{self.job_id}/assets/secret.png", headers=self.headers).status_code, 404)

    def test_symlink_and_manifest_traversal_rejected(self):
        outside = self.root / "private.txt"
        outside.write_text("secret")
        (self.output / "skin.png").unlink()
        (self.output / "skin.png").symlink_to(outside)
        self.assertEqual(recover_job(self.root, self.job_id)["status"], "failed")
        (self.output / "skin.png").unlink()
        (self.output / "skin.png").write_text("skin")
        self.manifest["detail_maps"]["albedo"] = "../../private.txt"
        (self.output / MANIFEST).write_text(json.dumps(self.manifest))
        self.assertEqual(recover_job(self.root, self.job_id)["status"], "failed")

    def test_job_directory_symlink_rejected(self):
        (self.root / ("b" * 32)).symlink_to(self.directory, target_is_directory=True)
        with self.assertRaises(ValueError):
            recover_job(self.root, "b" * 32)

    def test_package_size_limit(self):
        with patch("job_storage.MAX_BUNDLE_BYTES", 1):
            with self.assertRaisesRegex(ValueError, "limit"):
                head_bundle(self.directory)


if __name__ == "__main__":
    unittest.main()