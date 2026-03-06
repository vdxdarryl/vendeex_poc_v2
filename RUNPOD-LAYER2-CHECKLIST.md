# Layer 2 (Reranker) – RunPod setup checklist

Use this to get **Layer 2 (Qwen3-Reranker-8B / BGE Reranker)** running on RunPod.

---

## Step 1: Deploy the Pod

1. In RunPod go to **The Hub** → **Pod templates** (or wherever you see the template).
2. Find **"LLM Qwen3 Reranker BGE Reranker"** (image: `quay.io/nikolas/reranker:cuda-12.4`).
3. Click it and choose **Deploy** or **Configure Pod**.
4. **GPU:** Pick a GPU with **at least 16 GB** VRAM (e.g. L4, A10G, RTX 3090/4090). 24 GB is comfortable.
5. **Region:** Prefer the same region as your other RunPod services (e.g. EU if you want European infrastructure).
6. **Storage:** Use the default or add a small volume if the template asks. No need for a huge disk.
7. Start the Pod and wait until it shows **Running**.

---

## Step 2: Expose the port and get the URL

1. Open the Pod → **Connect** (or **Networking**).
2. Find **HTTP services** or **Ports**.
3. The container likely uses port **80**, **8080**, or **8012**. Expose that port (e.g. add HTTP service for that port if RunPod asks).
4. RunPod will show a URL like:
   - `https://xxxxx-80.proxy.runpod.net`  
   or  
   - `https://xxxxx-8080.proxy.runpod.net`  
   **Copy that URL** – this is your **Layer 2 base URL**.

---

## Step 3: Find the rerank API path

1. Try calling the service (see Step 4). Common paths:
   - `/rerank`
   - `/v1/rerank`
   - `/rank`
2. Use the path that returns a valid JSON response (scores or reranked list). Write it down.

---

## Step 4: Test the endpoint

From your Mac (Terminal), run (replace `YOUR-LAYER2-URL` with the URL from Step 2, and try with or without `/rerank`):

```bash
curl -X POST "https://YOUR-LAYER2-URL/rerank" \
  -H "Content-Type: application/json" \
  -d '{"query": "running shoes", "documents": ["Nike running shoes for men", "Kitchen blender"], "top_n": 2}'
```

- If you get **404**, try `https://YOUR-LAYER2-URL/v1/rerank` or `https://YOUR-LAYER2-URL/rank`.
- If you get **JSON** with scores or a reranked list, Layer 2 is working. Note the exact **path** and **request body shape** (field names) for the app.

---

## Step 5: Record in the project

Add to **PROJECT-NOTES.md** (or tell me and I’ll add it):

- **Layer 2 base URL:** `https://...`
- **Rerank path:** e.g. `/rerank` or `/v1/rerank`
- **Request shape:** e.g. `{"query": "...", "documents": ["...", "..."], "top_n": 5}`

---

## Checklist

- [ ] Pod deployed (LLM Qwen3 Reranker BGE Reranker), status **Running**
- [ ] Port exposed (80, 8080, or 8012), **Layer 2 base URL** copied
- [ ] `curl` test returns JSON (scores or reranked list)
- [ ] **Path** and **request shape** written down
- [ ] PROJECT-NOTES (or env) updated with Layer 2 URL and path

Once all are done, Layer 2 is configured. We’ll wire this URL and path into the app when we build the RAG pipeline.
