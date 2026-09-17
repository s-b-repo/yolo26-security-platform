import time

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from ultralytics import YOLO

CONF = 0.25
model = YOLO("yolo26n.pt")
app = FastAPI()


@app.get("/health")
def health():
    return {"ok": True, "model": "yolo26n", "classes": model.names}


@app.post("/detect")
async def detect(file: UploadFile):
    data = await file.read()
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return {"error": "undecodable image"}
    t0 = time.time()
    r = model(img, verbose=False, conf=CONF)[0]
    h, w = img.shape[:2]
    detections = []
    for b in r.boxes:
        x1, y1, x2, y2 = (float(v) for v in b.xyxy[0])
        detections.append({
            "object": r.names[int(b.cls)],
            "confidence": round(float(b.conf), 3),
            "bbox": {
                "x": round(x1 / w, 4),
                "y": round(y1 / h, 4),
                "w": round((x2 - x1) / w, 4),
                "h": round((y2 - y1) / h, 4),
            },
        })
    return {
        "model": "yolo26n",
        "latencyMs": round((time.time() - t0) * 1000, 1),
        "detections": detections,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="warning")
