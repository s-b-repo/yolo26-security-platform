import importlib.util
import queue
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("camera_workers", Path(__file__).resolve().parents[1] / "scripts" / "camera_workers.py")
workers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workers)


class WorkerTests(unittest.TestCase):
    def test_stock_weights_cannot_enable_firearm_monitoring(self):
        with self.assertRaises(ValueError):
            workers.validate_classes({0: "person", 43: "knife"})
        workers.validate_classes({0: "person", 43: "knife"}, knife_only=True)
        workers.validate_classes({0: "knife", 1: "pistol"})

    def test_scissors_are_not_a_knife(self):
        self.assertIsNone(workers.map_class("scissors"))
        self.assertEqual(workers.map_class("pistol"), "firearm")

    def test_frame_buffer_is_bounded(self):
        frames = queue.Queue(maxsize=1)
        workers.latest_put(frames, 1)
        workers.latest_put(frames, 2)
        self.assertEqual(frames.qsize(), 1)
        self.assertEqual(frames.get_nowait(), 2)

    def test_remote_tokens_require_tls(self):
        with self.assertRaises(ValueError):
            workers.validate_api_base("http://192.0.2.1:3000")
        self.assertEqual(workers.validate_api_base("http://127.0.0.1:3000"), "http://127.0.0.1:3000")
        with self.assertRaises(ValueError):
            workers.validate_api_base("https://user:password@example.test")


if __name__ == "__main__":
    unittest.main()
