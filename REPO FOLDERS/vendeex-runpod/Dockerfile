# orchestrator/Dockerfile
# VX-029-CAP-LLM: RAG Orchestration Service
# PoC placeholder -- production migration to Rust per VX-023-ENG
# 05/03/2026 | (c) 2026 Vendee Labs Limited

FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY main.py .

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
