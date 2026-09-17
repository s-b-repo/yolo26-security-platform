import hashlib
import multiprocessing as mp
import os
import queue
import signal
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

WEAPON_CLASS_NAMES = {"firearm", "gun", "handgun", "pistol", "rifle", "shotgun"}
CLASS_MAP = {
    "person": "person", "knife": "knife", "backpack": "backpack",
    "car": "vehicle", "truck": "vehicle", "bus": "vehicle", "motorcycle": "vehicle",
    **{name: "firearm" for name in WEAPON_CLASS_NAMES},
}


def model_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def map_class(name):
    return CLASS_MAP.get(name.lower())


def validate_classes(names, knife_only=False):
    available = {name.lower() for name in names.values()}
    if "knife" not in available:
        raise ValueError("weights must include a knife class")
    if not knife_only and not available.intersection(WEAPON_CLASS_NAMES):
        raise ValueError("firearm monitoring requires weapon-trained weights; stock COCO weights are insufficient")


def validate_api_base(value):
    parsed = urlsplit(value)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("SOC_API_BASE must not contain credentials, query, or fragment")
    if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}):
        raise ValueError("remote SOC_API_BASE must use HTTPS")
    return value.rstrip("/")


def latest_put(outbox, item):
    try:
        outbox.put_nowait(item)
    except queue.Full:
        try:
            outbox.get_nowait()
        except queue.Empty:
            pass
        try:
            outbox.put_nowait(item)
        except queue.Full:
            pass


def capture(camera, frames, stop):
    import cv2

    while not stop.is_set():
        stream = None
        session = str(uuid.uuid4())
        try:
            stream = cv2.VideoCapture(camera["streamUrl"], cv2.CAP_FFMPEG, [
                cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000,
                cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000,
            ])
            if not stream.isOpened():
                raise RuntimeError("stream unavailable")
            while not stop.is_set():
                ok, frame = stream.read()
                if not ok:
                    break
                latest_put(frames, (session, datetime.now(timezone.utc), frame))
        except Exception:
            print(f"[{camera['cameraId']}] capture unavailable; reconnecting", flush=True)
        finally:
            if stream is not None:
                stream.release()
        stop.wait(2)


def observations_from(result, width, height):
    boxes = result.boxes
    if boxes is None or boxes.id is None:
        return []
    observations = []
    for index, box in enumerate(boxes):
        kind = map_class(result.names[int(box.cls.item())])
        if kind is None:
            continue
        x1, y1, x2, y2 = (float(value) for value in box.xyxy[0])
        x1, x2 = max(0.0, min(width, x1)), max(0.0, min(width, x2))
        y1, y2 = max(0.0, min(height, y1)), max(0.0, min(height, y2))
        if x2 <= x1 or y2 <= y1:
            continue
        observations.append({
            "trackId": int(boxes.id[index].item()),
            "objectType": kind,
            "confidence": float(box.conf.item()),
            "bbox": {"x": x1 / width, "y": y1 / height, "w": (x2 - x1) / width, "h": (y2 - y1) / height},
        })
    return observations


def camera_worker(camera, settings, stop):
    os.environ["YOLO_AUTOINSTALL"] = "false"
    os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
    import cv2
    import requests
    import torch
    from ultralytics import YOLO

    torch.set_num_threads(1)
    cv2.setNumThreads(1)
    model = YOLO(settings["weights"])
    validate_classes(model.names, settings["knife_only"])
    model_hash = model_sha256(settings["weights"])
    frames = queue.Queue(maxsize=1)
    reader = threading.Thread(target=capture, args=(camera, frames, stop), daemon=True)
    reader.start()
    session_id = None
    last_capture_session = None
    frame_id = 0
    last_capture = None
    with requests.Session() as http:
        http.trust_env = False
        http.headers["Authorization"] = f"Bearer {settings['token']}"
        try:
            while not stop.is_set():
                try:
                    capture_session, captured_at, frame = frames.get(timeout=1)
                except queue.Empty:
                    continue
                if (datetime.now(timezone.utc) - captured_at).total_seconds() > 5:
                    continue
                if last_capture_session != capture_session or (last_capture and (captured_at - last_capture).total_seconds() > 5):
                    last_capture_session = capture_session
                    session_id = str(uuid.uuid4())
                    frame_id = 0
                    for tracker in getattr(getattr(model, "predictor", None), "trackers", []):
                        tracker.reset()
                last_capture = captured_at
                result = model.track(frame, persist=True, tracker="bytetrack.yaml", conf=settings["confidence"], device=settings["device"], verbose=False)[0]
                height, width = frame.shape[:2]
                observations = observations_from(result, width, height)
                payload = {
                    "kind": "observations", "cameraId": camera["cameraId"],
                    "sessionId": session_id, "frameId": frame_id,
                    "capturedAt": captured_at.isoformat().replace("+00:00", "Z"),
                    "model": model_hash, "observations": observations,
                }
                frame_id += 1
                if len(observations) > 64:
                    print(f"[{camera['cameraId']}] detection capacity exceeded; frame skipped", flush=True)
                    continue
                try:
                    response = http.post(f"{settings['api']}/api/ingest", json=payload, timeout=(3, 10), allow_redirects=False)
                    if response.status_code != 200:
                        print(f"[{camera['cameraId']}] ingest rejected: HTTP {response.status_code}", flush=True)
                        if response.status_code in {401, 403}:
                            raise RuntimeError("ingest authentication rejected")
                    else:
                        events = response.json().get("eventsFired", [])
                        if events:
                            print(f"[{camera['cameraId']}] {len(events)} alert(s) require operator review", flush=True)
                except requests.RequestException:
                    print(f"[{camera['cameraId']}] ingest unavailable; frame discarded", flush=True)
                stop.wait(settings["interval"])
        finally:
            reader.join(timeout=6)


def main():
    import requests

    try:
        settings = {
            "api": validate_api_base(os.environ.get("SOC_API_BASE", "http://127.0.0.1:3000")),
            "token": os.environ.get("INGEST_TOKEN", ""),
            "weights": os.environ.get("SOC_MODEL_PATH", ""),
            "knife_only": os.environ.get("SOC_KNIFE_ONLY") == "true",
            "confidence": float(os.environ.get("SOC_CONF", "0.4")),
            "interval": float(os.environ.get("SOC_POLL_SECONDS", "0.25")),
            "device": os.environ.get("SOC_DEVICE", "cpu"),
        }
        limit = int(os.environ.get("SOC_MAX_CAMERAS", "4"))
        if len(settings["token"]) < 32 or not Path(settings["weights"]).is_file():
            raise ValueError("set INGEST_TOKEN (32+ characters) and SOC_MODEL_PATH to trusted local weights")
        if not 1 <= limit <= 32 or not 0.4 <= settings["confidence"] <= 1 or not 0 <= settings["interval"] <= 2:
            raise ValueError("invalid camera limit, confidence, or polling interval")
        os.environ["YOLO_AUTOINSTALL"] = "false"
        from ultralytics import YOLO
        probe = YOLO(settings["weights"])
        validate_classes(probe.names, settings["knife_only"])
        del probe
        with requests.Session() as http:
            http.trust_env = False
            response = http.get(f"{settings['api']}/api/ingest/cameras", headers={"Authorization": f"Bearer {settings['token']}"}, timeout=(3, 10), allow_redirects=False)
            if response.status_code != 200:
                raise ValueError(f"camera registry returned HTTP {response.status_code}")
            cameras = response.json()["cameras"]
        selected = {item.strip().upper() for item in os.environ.get("SOC_CAMERA_IDS", "").split(",") if item.strip()}
        if selected:
            cameras = [camera for camera in cameras if camera["cameraId"] in selected]
            if {camera["cameraId"] for camera in cameras} != selected:
                raise ValueError("some selected cameras are not registered")
        if not cameras or len(cameras) > limit:
            raise ValueError("select 1 to SOC_MAX_CAMERAS registered cameras with SOC_CAMERA_IDS")
        for camera in cameras:
            parsed = urlsplit(camera["streamUrl"])
            if parsed.scheme not in {"rtsp", "rtsps"} or not parsed.hostname:
                raise ValueError("registered camera has an invalid RTSP stream")
    except Exception as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print("vision configuration or model initialization failed", file=sys.stderr)
        return 2

    context = mp.get_context("spawn")
    stop = context.Event()
    workers = [context.Process(target=camera_worker, args=(camera, settings, stop), name=camera["cameraId"]) for camera in cameras]
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    for worker in workers:
        worker.start()
    print(f"Starting {len(workers)} isolated camera workers; four consecutive processed-frame confirmations; knife-only={settings['knife_only']}", flush=True)
    failed = False
    try:
        while not stop.wait(1):
            if any(not worker.is_alive() for worker in workers):
                failed = True
                stop.set()
    finally:
        stop.set()
        for worker in workers:
            worker.join(timeout=10)
            if worker.is_alive():
                worker.terminate()
                worker.join(timeout=5)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
