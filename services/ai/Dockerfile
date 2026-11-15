# Docker image for the AI service (mock mode on laptops). Owner: Qussai.
# Build from services/ai/: docker build -t noor-ai .
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV MOCK_MODE=true
# The reference text is not in the image: docker-compose.yml mounts packages/contracts/data here
ENV REFERENCE_DATA_DIR=/data/reference
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
