# RunPod: Configure Layer 1 (Embedding) and Layer 2 (Reranker)

Step-by-step guide to deploy **Qwen3-Embedding-4B** (Layer 1) and **Qwen3-Reranker-8B** (Layer 2) on RunPod, per VX-029.

---

## What you’re deploying

| Layer | Model | Purpose | Approx. GPU need |
|-------|--------|---------|-------------------|
| **1** | Qwen3-Embedding-4B | Turn text into vectors (ingestion + retrieval) | ~4 GB VRAM |
| **2** | Qwen3-Reranker-8B | Score query + passages → top 5–10 | ~16 GB VRAM |

You can use **two Pods** (one per layer) or, if you prefer, **one Pod** with a larger GPU (e.g. 24 GB) and run both services on it (advanced; not covered in this guide). Below assumes **two Pods** for simplicity.

---

## Option A: Use RunPod Hub templates (if available)

1. In RunPod go to **The Hub** → **Pod templates** (or **Serverless**).
2. Search for **“embedding”** and **“reranker”** (or **“TEI”**, **“Qwen”**).
3. If you see a template for **Qwen3-Embedding** or **Text Embeddings Inference**:
   - Deploy it as a **Pod** (or Serverless if that’s what the template is).
   - Note the **URL** and **port** (often 8080 or 80) and the **API path** (e.g. `/embed` or `/v1/embeddings`). That’s your **Layer 1 endpoint**.
4. If you see a template for **Qwen3-Reranker** or **reranker**:
   - Deploy it as a **Pod** (or Serverless).
   - Note the **URL** and **port** and the **API path** (e.g. `/v1/rerank`). That’s your **Layer 2 endpoint**.

If both templates exist, use them and skip Option B. If not, use Option B below.

---

## Option B: Deploy from Docker image (custom Pod)

If there’s no ready-made template, create a **Pod** and choose **“Deploy from Docker image”** (or “Custom container”) and use the images below.

### Layer 1: Qwen3-Embedding-4B

1. **New Pod** → **Custom deployment** / **Docker image**.
2. **Docker image:**  
   - Either: `ghcr.io/huggingface/text-embeddings-inference:cuda-1.9` with **model-id** set to `Qwen/Qwen3-Embedding-4B` (if RunPod lets you pass env vars or command args).  
   - Or: `ai/qwen3-embedding` (Docker Hub) if RunPod has it and it’s compatible.
3. **GPU:** 1x GPU with **at least 8 GB** VRAM (e.g. T4, L4). 4B model needs ~4 GB; 8 GB gives headroom.
4. **Port:** Expose **8080** (TEI default) or **80** (if the image uses 80). In RunPod **Connect** / **Networking**, note the **HTTP service** URL for this port (e.g. `https://xxxx-8080.proxy.runpod.net`).
5. **Environment variables** (if the image supports them):
   - `MODEL_ID=Qwen/Qwen3-Embedding-4B` (for TEI).
6. After the Pod is running, your **Layer 1 base URL** is that HTTP URL (e.g. `https://xxxx-8080.proxy.runpod.net`). The app will call e.g. `/embed` or `/v1/embeddings` (check the image docs).

**Quick test:** From your machine:
```bash
curl -X POST "https://YOUR-LAYER1-URL/embed" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "test sentence"}'
```
(Replace `/embed` with `/v1/embeddings` and the body with `{"input": "test sentence"}` if the API expects that.)

---

### Layer 2: Qwen3-Reranker-8B

1. **New Pod** → **Custom deployment** / **Docker image**.
2. **Docker image:** `ai/qwen3-reranker:8B` (Docker Hub). If that’s not available on RunPod, use a Hugging Face inference server image that supports `Qwen/Qwen3-Reranker-8B` and a `/rerank` or `/v1/rerank` endpoint.
3. **GPU:** 1x GPU with **at least 16 GB** VRAM (e.g. L4, A10G, RTX 3090/4090). 24 GB is comfortable.
4. **Port:** Expose **8012** (common for reranker APIs) or the port the image documents (e.g. 80). In RunPod **Connect** / **Networking**, note the **HTTP service** URL for this port.
5. After the Pod is running, your **Layer 2 base URL** is that HTTP URL.

**Quick test:** Reranker APIs usually expect a query and a list of documents. Example shape:
```bash
curl -X POST "https://YOUR-LAYER2-URL/v1/rerank" \
  -H "Content-Type: application/json" \
  -d '{"query": "test query", "documents": ["doc 1", "doc 2"], "top_n": 5}'
```
(Adjust path and body to match the image’s API.)

---

## After both are running

1. **Write down** (or add to PROJECT-NOTES.md):
   - **Layer 1 URL** (embedding): `https://...`
   - **Layer 2 URL** (reranker): `https://...`
   - Any **API keys** if the images or RunPod require them.
2. **Layer 3** stays as your existing Serverless endpoint (Qwen 2.5-32B); no change needed for this step.
3. **Vector store (Qdrant)** is separate; it’s configured later and connected to Layer 1 for ingestion and retrieval.

---

## If RunPod only offers “run your own Dockerfile”

- For **Layer 1**, use a Dockerfile that runs **Text Embeddings Inference** with `Qwen/Qwen3-Embedding-4B`, or the official `ai/qwen3-embedding` image, and expose the embed port.
- For **Layer 2**, use a Dockerfile that runs the **Qwen3-Reranker-8B** server (e.g. `ai/qwen3-reranker:8B` or a Hugging Face inference server for rerank), and expose the rerank port.

Then create a **custom Pod template** from that image and deploy as above.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Check RunPod Hub for “embedding” and “reranker” templates; use them if they match Qwen3. |
| 2 | If not, deploy **Layer 1** Pod from a Qwen3-Embedding-4B image (TEI or `ai/qwen3-embedding`), expose port, note URL. |
| 3 | Deploy **Layer 2** Pod from Qwen3-Reranker-8B image (`ai/qwen3-reranker:8B` or equivalent), expose port, note URL. |
| 4 | Record both URLs (and any keys) in PROJECT-NOTES or your env config for the app. |

Once Layer 1 and Layer 2 URLs are fixed, we can wire them (and Qdrant) into the app in code.
