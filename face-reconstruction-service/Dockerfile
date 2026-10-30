FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FACE_PIPELINE_ROOT=/opt/humanoid-face \
    FACE_MODEL_DIR=/models \
    FACE_WORK_ROOT=/var/lib/avatarace/jobs

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /service
COPY face-reconstruction-service/requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install --no-cache-dir -r requirements.txt

COPY face-reconstruction-service/app.py ./app.py
COPY . /opt/humanoid-face

# Public MediaPipe task assets used by the proven Termux flow. Licensed FLAME
# and clean-room support assets remain mounted read-only at /models.
RUN mkdir -p /opt/humanoid-face/models_cache/mediapipe \
    && curl -fL --retry 3 https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task -o /opt/humanoid-face/models_cache/mediapipe/face_landmarker.task \
    && curl -fL --retry 3 https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite -o /opt/humanoid-face/models_cache/mediapipe/selfie_multiclass_256x256.tflite


RUN mkdir -p /models /var/lib/avatarace/jobs
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
