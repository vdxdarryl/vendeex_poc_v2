# Project notes

Short reference for anyone working on this repo (including AI assistants).

---

## Phase 4: Self-hosted intelligence layer (VX-029)

- **Authority:** Phase 4 self-hosted AI follows **VX-029-CAP-LLM Self-Hosted Intelligence Layer v1.0** (Vendee Labs technical design, 02 March 2026).
- **Hosting:** All three Qwen layers + **Qdrant** vector store on **RunPod.io** (European-incorporated infrastructure). Together they form a **RAG pipeline**.
- **Scope:** Self-hosted layer handles the two member-facing chat windows (qualify + refine) and internal reasoning; product search and retrieval continue to use Claude, ChatGPT, Perplexity, Affiliate.com, and Channel3.

### Three layers (per VX-029)

| Layer | Model | Role |
|-------|--------|------|
| **1. Embedding** | **Qwen3-Embedding-4B** | **Ingestion:** Continuously process completed transcripts (Chat 1 & 2), preference deltas, purchase outcomes → chunk, add task context, embed into vector store. **Retrieval:** When member opens Chat 1, embed their input (query prefix), vector search over member history + population corpus → **top 50** candidate fragments. (CPU ok for ingestion; GPU for retrieval.) |
| **2. Reranking** | **Qwen3-Reranker-8B** | Receives top 50 from Layer 1; scores each candidate against current query (full cross-attention). Reduces **50 → top 5–10** fragments so the LLM context is not diluted. Sub-second on quantised deployment. |
| **3. Reasoning & conversation** | **Qwen 2.5-32B** | Powers Chat Window One (qualify) and Chat Window Two (refine). All dialogue and reasoning stay inside VendeeX. |

- **Vector store:** Qdrant stores embeddings; ingestion writes, retrieval reads. Required for Layer 1.

---

---

## RunPod configuration status (VX-029)

**Full setup guide:** See **RUNPOD-ALL-THREE-LAYERS-SETUP.md** for step-by-step instructions to configure all three layers from a clean start.

| Layer | Model | RunPod status | Notes |
|-------|--------|----------------|--------|
| **1. Embedding** | Qwen3-Embedding-4B | ⬜ To configure | TEI Pod (or Serverless); set model to Qwen/Qwen3-Embedding-4B. |
| **2. Reranking** | Qwen3-Reranker-8B | ⬜ To configure | Reranker Pod; expose correct port, find path (/rerank or /v1/rerank). |
| **3. Reasoning & conversation** | Qwen 2.5-32B | ⬜ To configure | Serverless vLLM or Pod vLLM; get endpoint URL + API key. |
| **Vector store** | Qdrant | ⬜ Not yet configured | Separate; for Layer 1 ingestion and retrieval. |

*(After you complete the setup, fill in the URLs and keys below.)*

### Layer 3
- **Endpoint URL:** *(from RunPod Serverless or Pod)*
- **API key:** *(if Serverless)*

### Layer 1
- **Base URL:** *(e.g. https://xxxx-8080.proxy.runpod.net)*
- **Embed path:** *(e.g. /embed or /v1/embeddings)*

### Layer 2
- **Base URL:** *(e.g. https://xxxx-8012.proxy.runpod.net)*
- **Rerank path:** *(e.g. /rerank or /v1/rerank)*

---

*Current focus: Phase 1–3 (rebuild, deploy to www.vendeex.com, confirm outcomes). Phase 4 starts after sign-off.*
