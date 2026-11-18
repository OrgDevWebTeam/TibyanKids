# AI service image for laptops (MOCK_MODE=true). Build from services/ai/: docker build -t tibyan-ai .
# It installs the model packages too, because every module imports them at the top; no model is loaded.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt requirements-gpu.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-gpu.txt

COPY app ./app

ENV MOCK_MODE=true
# The reference text is not in the image: docker-compose.yml mounts packages/contracts/data here
ENV REFERENCE_DATA_DIR=/data/reference
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
