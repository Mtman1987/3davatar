FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FACE_PIPELINE_ROOT=/opt/humanoid-face \
    FACE_MODEL_DIR=/models \
    FACE_WORK_ROOT=/var/lib/avatarace/jobs

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /service
COPY face-reconstruction-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY face-reconstruction-service/app.py ./app.py
COPY . /opt/humanoid-face

RUN mkdir -p /models /var/lib/avatarace/jobs
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
