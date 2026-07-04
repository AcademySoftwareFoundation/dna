# CPU-only WhisperLive for browser-extension transcription.
#
# ghcr.io/collabora/whisperlive-cpu is amd64-only; hwdsl2/whisper-live-server
# arm64 images crash loading CUDA libraries on Apple Silicon. This follows
# Collabora's docker/Dockerfile.cpu and builds natively on arm64 and amd64.

FROM python:3.10-bookworm

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    portaudio19-dev \
    git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -U "pip>=24"

WORKDIR /app

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

ARG WHISPERLIVE_REF=main
RUN git clone --depth 1 --branch "${WHISPERLIVE_REF}" https://github.com/collabora/WhisperLive.git /tmp/whisperlive \
    && cp -r /tmp/whisperlive/whisper_live /app/whisper_live \
    && cp /tmp/whisperlive/run_server.py /app/run_server.py \
    && pip install --no-cache-dir -r /tmp/whisperlive/requirements/server.txt \
    && rm -rf /tmp/whisperlive

EXPOSE 9090

CMD ["python", "run_server.py", "--port", "9090", "--backend", "faster_whisper"]
