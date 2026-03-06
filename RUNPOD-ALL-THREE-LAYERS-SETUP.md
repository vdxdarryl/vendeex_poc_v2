# RunPod: Full setup for all three layers (VX-029)

Clean-start guide to configure **Layer 1 (Embedding)**, **Layer 2 (Reranker)**, and **Layer 3 (Reasoning & conversation)** on RunPod. Do these in order. Record every URL and key as you go.

---

## Before you start

1. **Delete** any existing RunPod Pods or Serverless endpoints you used for these layers (so you start fresh and don’t get confused).
2. Have your **RunPod** account and **billing** (e.g. Savings Plan) ready.
3. Keep a **notepad** or **PROJECT-NOTES.md** open to paste:
   - Layer 1 base URL and port
   - Layer 2 base URL and rerank path
   - Layer 3 endpoint URL and API key

---

# LAYER 3: Reasoning & conversation (Qwen 2.5-32B)

**Role:** Powers Chat Window One (qualify) and Chat Window Two (refine).  
**Model:** Qwen 2.5-32B (e.g. GPTQ-Int4 or FP8).

---

## Option A: Serverless (recommended – no Pod to manage)

1. In RunPod go to **Manage** → **Serverless**.
2. Click **"+ New Endpoint"** (or **Deploy**).
3. Choose a **vLLM** template (e.g. “vLLM” or “vLLM OpenAI-compatible”). If RunPod asks for a **Docker image**, use the one that matches the vLLM + Qwen 2.5 template (e.g. from the Hub).
4. **Model:** Set to **`qwen/qwen2.5-32b-instruct-gptq-int4`** (or the exact model ID the template expects). If the template is pre-configured for Qwen 2.5-32B, leave it as is.
5. **GPU / Workers:** e.g. 80 GB, 1–3 workers (adjust to your plan). Save/Deploy.
6. When the endpoint is **Ready**, open it and copy:
   - **Endpoint URL** (e.g. `https://api.runpod.ai/v2/XXXXXXXXX/run`).
   - **API key** (from the endpoint’s Settings / API Key / Connect).
7. **Record:**
   - `RUNPOD_LAYER3_ENDPOINT_URL = https://api.runpod.ai/v2/.../run`
   - `RUNPOD_LAYER3_API_KEY = ...`

**Quick test (optional):**
```bash
curl -X POST "YOUR_LAYER3_URL" \
  -H "Authorization: Bearer YOUR_LAYER3_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"prompt":"Hello","max_tokens":50}}'
```
(Exact body may vary by RunPod Serverless handler; check RunPod’s doc for “run” or “runsync” request format.)

---

## Option B: Pod (vLLM template)

1. In RunPod go to **The Hub** → **Pod templates**.
2. Search for **“vLLM”** and pick a **Qwen 2.5-32B** or **Qwen3-32B** template (e.g. “Qwen3 32B FP8 - vLLM by Trelis” or a Qwen 2.5 vLLM template).
3. **Deploy** → choose **GPU** (e.g. 1× A6000 or 1× A100, 48GB+). Deploy.
4. When the Pod is **Running**, go to **Connect** → **Networking**.
5. **Generate / expose public domain** for the port vLLM uses (usually **8000**). Copy the URL (e.g. `https://xxxxx-8000.proxy.runpod.net`).
6. **Record:**
   - `RUNPOD_LAYER3_BASE_URL = https://xxxxx-8000.proxy.runpod.net`
   - API path for chat: usually **`/v1/chat/completions`** (OpenAI-compatible).
7. **Test:**
```bash
curl -X POST "https://YOUR_LAYER3_BASE_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen2.5-32B-Instruct","messages":[{"role":"user","content":"Hi"}],"max_tokens":50}'
```

---

# LAYER 1: Embedding (Qwen3-Embedding-4B)

**Role:** Ingest text into vectors (for Qdrant); at retrieval, embed the query and get top-50 candidates.  
**Model:** Qwen3-Embedding-4B.

---

1. In RunPod go to **The Hub** → **Pod templates** (or **Serverless** if you see an embedding template there).
2. Search for **“embedding”** or **“text-embeddings-inference”** or **“TEI”**.
3. Pick the **Text Embeddings Inference** template (e.g. “text-embeddings-inference-ada” or similar). Image is often `ghcr.io/huggingface/text-embeddings-inference:...`.
4. **Deploy as Pod** (or Serverless if that’s the only option).  
   **GPU:** 1× with **≥ 8 GB** VRAM (e.g. T4, L4).
5. **Set the model to Qwen3-Embedding-4B:**  
   In the Pod/template **Settings** or **Environment**, set:
   - **Model ID / MODEL_ID** = **`Qwen/Qwen3-Embedding-4B`**  
   If the template doesn’t allow changing the model, you may need a custom Pod with Docker image and this model (see RUNPOD-LAYER1-LAYER2-SETUP.md).
6. Expose the **port** the embedding server uses (often **8080** or **80**). In **Connect** → **Networking**, note the **HTTP proxy URL** for that port (e.g. `https://yyyyy-8080.proxy.runpod.net`).
7. **Record:**
   - `RUNPOD_LAYER1_BASE_URL = https://yyyyy-8080.proxy.runpod.net`
   - Embed path: usually **`/embed`** or **`/v1/embeddings`**.
8. **Test:**
```bash
curl -X POST "https://YOUR_LAYER1_BASE_URL/embed" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "test sentence"}'
```
If 404, try path **`/v1/embeddings`** with body `{"input": "test sentence"}` (or `{"input": ["test sentence"]}`).

---

# LAYER 2: Reranker (Qwen3-Reranker-8B)

**Role:** Takes the top-50 candidates from Layer 1 and returns the top 5–10 by relevance.  
**Model:** Qwen3-Reranker-8B (or a compatible reranker).

---

1. In RunPod go to **The Hub** → **Pod templates**.
2. Search for **“reranker”** or **“Qwen3 reranker”**.
3. Pick a **reranker** template. Examples:
   - **“LLM Qwen3 Reranker BGE Reranker”** (`quay.io/nikolas/reranker:cuda-12.4`) – if you use this, **read the template’s “Readme” or “Template readme” tab** in RunPod to see the **port** and **API path**. If there is no readme, try exposing **port 80**, then **8012**, then **8080** and test (see step 6).
   - Any other template that says “Qwen3 Reranker” or “Reranker” and has a short description of the API.
4. **Deploy** → **GPU:** 1× with **≥ 16 GB** VRAM (e.g. L4, A10G).
5. When the Pod is **Running**, go to **Connect** → **Networking**.  
   **Expose the port** the reranker uses. If the template says which port (e.g. 8012 or 80), expose that. If not, expose **80** first, then try **8012** and **8080** until a test works.
6. Note the **proxy URL** for that port (e.g. `https://zzzzz-8012.proxy.runpod.net`).
7. **Record:**
   - `RUNPOD_LAYER2_BASE_URL = https://zzzzz-8012.proxy.runpod.net`
8. **Find the path** by testing (use your actual Layer 2 URL):

```bash
# Try /rerank
curl -s -w "\nHTTP:%{http_code}" -X POST "https://YOUR_LAYER2_BASE_URL/rerank" \
  -H "Content-Type: application/json" \
  -d '{"query":"shoes","documents":["Nike running shoes","Kitchen blender"],"top_n":2}'
```

If you see **404**, try the same with path **`/v1/rerank`**, then **`/rank`**. Use whichever returns **HTTP:200** and a JSON body with scores or a reranked list. Record that path (e.g. `RUNPOD_LAYER2_RERANK_PATH = /rerank`).

---

# After all three layers

1. **Record in PROJECT-NOTES.md** (or your env):
   - Layer 1: base URL, embed path, port.
   - Layer 2: base URL, rerank path, port.
   - Layer 3: endpoint URL (and base URL if Pod) + API key.
2. **Vector store (Qdrant):** Configure separately (same project, different doc). Layer 1 writes/reads vectors there; no RunPod steps in this file.
3. **App:** When we wire the RAG pipeline in code, we’ll use these URLs and paths.

---

# Checklist summary

| Layer | What to deploy | GPU (min) | What to record |
|-------|----------------|-----------|----------------|
| **3** | Serverless vLLM or Pod vLLM (Qwen 2.5-32B) | 48GB (Pod) or plan default (Serverless) | Endpoint URL + API key (or base URL + /v1/chat/completions) |
| **1** | Pod (or Serverless) Text Embeddings Inference, model Qwen/Qwen3-Embedding-4B | 8 GB | Base URL + port + path (/embed or /v1/embeddings) |
| **2** | Pod Reranker (Qwen3/BGE template) | 16 GB | Base URL + port + path (/rerank or /v1/rerank or /rank) |

---

# If something doesn’t work

- **Layer 3:** Ensure the model ID is exactly as in the template (e.g. `qwen/qwen2.5-32b-instruct-gptq-int4`). For Serverless, use the request format from RunPod’s docs.
- **Layer 1:** If the template won’t switch to Qwen3-Embedding-4B, use a custom Pod with image `ghcr.io/huggingface/text-embeddings-inference:cuda-1.9` and env `MODEL_ID=Qwen/Qwen3-Embedding-4B`, then expose port 8080.
- **Layer 2:** If every path returns 404, the app may be on a different port. In the Pod’s **Connect** or **Logs**, check which port the process listens on; expose that port in RunPod and use its proxy URL in the curl tests.
