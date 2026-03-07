# Project notes

Short reference for anyone working on this repo (including AI assistants).

---

## Phase 4: Self-hosted intelligence layer (VX-029)

- **Authority:** Phase 4 self-hosted AI follows **VX-029-CAP-LLM Self-Hosted Intelligence Layer v1.0** (Vendee Labs technical design, 02 March 2026).
- **Hosting:** All three inference layers + **Qdrant** vector store on **RunPod.io** (European-incorporated infrastructure). Together they form a **RAG pipeline**.
- **Scope:** Self-hosted layer handles the two member-facing chat windows (qualify + refine) and internal reasoning; product search and retrieval continue to use Claude, ChatGPT, Perplexity, Affiliate.com, and Channel3.

### Three layers (per VX-029)

| Layer | Model | Role |
|-------|-------|------|
| **1. Embedding** | **Qwen3-Embedding-4B via TEI** | **Ingestion:** Continuously process completed transcripts (Chat 1 & 2), preference deltas, purchase outcomes → chunk, add task context, embed into Qdrant vector store. **Retrieval:** When member opens Chat 1, embed their input (query prefix), vector search over member history + population corpus → **top 50** candidate fragments. |
| **2. Reranking** | **BAAI/bge-reranker-v2-m3 via TEI** | Receives top 50 from Layer 1; scores each candidate against current query (cross-encoder, classification head). Reduces **50 → top 5–10** fragments so the LLM context is not diluted. Note: Qwen3-Reranker-8B is **NOT** compatible with TEI's `/rerank` endpoint — it is a generative reranker, not a cross-encoder. bge-reranker-v2-m3 is the correct TEI-native replacement. |
| **3. Reasoning & conversation** | **Qwen2.5-32B-Instruct-GPTQ-Int4 via vLLM** | Powers Chat Window One (qualify) and Chat Window Two (refine). All dialogue and reasoning stay inside VendeeX. |

- **Vector store:** Qdrant stores embeddings; ingestion writes, retrieval reads. Required for Layer 1.

---

## RunPod pod status (VX-029)

**Last verified:** 07/03/2026

| Service | Pod name | Pod ID | URL | Compute | Cost | Status |
|---------|----------|--------|-----|---------|------|--------|
| **Qdrant vector store** | vx-029-qdrant | nelw1rqop4dbt4 | `https://nelw1rqop4dbt4-6333.proxy.runpod.net` | CPU3 General Purpose, 2 vCPU, 8GB RAM | $0.08/hr | ✅ Running |
| **Layer 2 Reranker** | vx-029-reranker | zgjst0w1hwjq3n | `https://zgjst0w1hwjq3n-80.proxy.runpod.net` | RTX A4500 20GB | $0.26/hr | ✅ Running |
| **Layer 1 Embedding** | vx-029-embedding | glqbwdblbdi2i5 | `https://glqbwdblbdi2i5-80.proxy.runpod.net` | L4 | $0.40/hr | ✅ Running |
| **Layer 3 vLLM / Qwen2.5-32B** | vx-029-poc | 77go3dqkmasd8a | `https://77go3dqkmasd8a-8000.proxy.runpod.net` | RTX A6000 | $0.51/hr | ✅ Running |

**Total RunPod cost while all pods running: $1.25/hr**

### Pod configuration details

#### Qdrant (vx-029-qdrant)
- **Image:** `qdrant/qdrant`
- **HTTP port:** 6333
- **TCP port:** 6334
- **Volume mount:** `/qdrant/storage`
- **Verified endpoint:** `GET /collections` returns `{"result":{"collections":[]},"status":"ok"}`

#### Layer 2 Reranker (vx-029-reranker)
- **Image:** `ghcr.io/huggingface/text-embeddings-inference:cuda-1.9`
- **Start command:** `--model-id BAAI/bge-reranker-v2-m3`
- **ENV:** `MODEL_ID=BAAI/bge-reranker-v2-m3`
- **HTTP port:** 80
- **Verified endpoint:** `POST /rerank` returns scored index array

#### Layer 1 Embedding (vx-029-embedding)
- **Image:** TEI
- **Model:** `Qwen/Qwen3-Embedding-4B`
- **HTTP port:** 80
- **Embed path:** `/embed`

#### Layer 3 vLLM (vx-029-poc)
- **Model:** `Qwen2.5-32B-Instruct-GPTQ-Int4`
- **Loaded from:** `/workspace`
- **Startup script:** `/workspace/start_vllm.sh`
- **HTTP port:** 8000
- **SSH access:** live

---

## Railway environment variables (VX-029)

The following variables must be set in the Railway dashboard to wire the RAG pipeline into the PoC application.

```
QDRANT_URL=https://nelw1rqop4dbt4-6333.proxy.runpod.net
EMBEDDING_URL=https://glqbwdblbdi2i5-80.proxy.runpod.net
RERANKER_URL=https://zgjst0w1hwjq3n-80.proxy.runpod.net
VLLM_URL=https://77go3dqkmasd8a-8000.proxy.runpod.net
```

---

## Important lessons learned (RunPod)

- **EU-SE-1 region:** persistent Docker Hub pull failures. Use US regions only.
- **TEI port:** TEI serves on port **80** by default, not 8080.
- **Start command:** must be set at pod creation. It cannot be added retroactively to a running pod. This was the root cause of the original reranker crash loop.
- **Qwen3-Reranker-8B is incompatible with TEI.** It is a generative/causal reranker that derives scores from token probabilities. TEI's `/rerank` endpoint requires a traditional cross-encoder with a classification head. TEI returns `model is not a re-ranker model`. Use `BAAI/bge-reranker-v2-m3` instead.
- **CPU pods** for Qdrant: use the Template Overrides 'Edit' flow, same as GPU pods.

---

## Phase 4 next steps

- [ ] Create Qdrant collection for VendeeX embeddings
- [ ] Wire Railway environment variables
- [ ] Implement ingestion pipeline (chunk → embed → write to Qdrant)
- [ ] Implement retrieval pipeline (embed query → Qdrant top 50 → reranker top 5–10 → vLLM)
- [ ] Test full RAG pipeline end to end
- [ ] Reduce Railway from 2 replicas to 1

---

*Current focus: Phase 4 RAG pipeline integration (VX-029). All four RunPod services are live and verified.*
