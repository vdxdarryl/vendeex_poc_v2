# VX-029-CAP-LLM: RunPod Deployment Guide
# 05/03/2026 | (c) 2026 Vendee Labs Limited
# Classification: CONFIDENTIAL

## IMPORTANT COMPLIANCE NOTE

This deployment uses RunPod (US-incorporated). This is a PoC iteration
expedient only. Must migrate to a qualifying European-incorporated provider
before any member data or investor demonstration. See VX-029 §5.2 Test 1.
Qualifying providers: Scaleway, OVHcloud, Hetzner, DataCrunch, Exoscale,
Genesis Cloud.

---

## What this package contains

    docker-compose.yaml       Five-service stack (Qdrant, vLLM, TEI x2, Orchestrator)
    .env.template             All required environment variables with documentation
    orchestrator/
      Dockerfile              Container definition for PoC placeholder
      main.py                 FastAPI stub -- health checks + status endpoint
      requirements.txt        Python dependencies
    init-collections.sh       Qdrant collection initialisation (run once)
    test-layers.sh            Stack verification tests (run after deployment)

---

## Step-by-step deployment on RunPod

### Step 1: Launch the Pod

On RunPod:
- Navigate to Pods
- Region filter: All of Europe
- Select: RTX A6000 48GB
- Template: RunPod PyTorch (or any Ubuntu 22.04 with CUDA)
- Storage: 100GB minimum (model weights ~25GB, vector store, logs)
- Deploy

Wait for Pod status to show Running.

### Step 2: Connect to the Pod

In RunPod, click Connect on the Pod. Use the web terminal or SSH.
To SSH, RunPod provides a command like:
  ssh root@[pod-ip] -p [port] -i ~/.ssh/id_rsa

### Step 3: Verify GPU and Docker

Once connected, run:

    nvidia-smi
    docker --version
    docker compose version

If docker compose is not available:

    apt update && apt install -y docker-compose-plugin

### Step 4: Install NVIDIA Container Toolkit

    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
      gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
      tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

    apt update && apt install -y nvidia-container-toolkit
    systemctl restart docker

Verify GPU pass-through:

    docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi

### Step 5: Upload this deployment package

From your local machine, copy this directory to the Pod:

    scp -r -P [port] /path/to/vendeex-runpod root@[pod-ip]:/root/vendeex-runpod

Or clone from your GitHub repository once files are committed.

### Step 6: Create your .env file

    cd /root/vendeex-runpod
    cp .env.template .env
    nano .env

Fill in:
- HF_TOKEN: your HuggingFace Read token
- VX_LLM_API_KEY: generate with: openssl rand -hex 32

Save and exit (Ctrl+X, Y, Enter in nano).

### Step 7: Launch the stack

    cd /root/vendeex-runpod
    docker compose up -d

This will:
1. Build the orchestrator container (~2 minutes)
2. Pull all service images (~5 minutes on first run)
3. Download model weights from HuggingFace (~15-30 minutes on first run)
4. Start all services in dependency order

Monitor progress:

    docker compose logs -f

Wait until you see all five containers passing health checks.

### Step 8: Initialise Qdrant collections

Run once after Qdrant is healthy:

    bash init-collections.sh

### Step 9: Verify the full stack

    VX_LLM_API_KEY=your_key bash test-layers.sh

All five tests should pass. If any fail, check logs:

    docker compose logs vx-llm
    docker compose logs vx-embedding
    docker compose logs vx-reranker

### Step 10: Expose ports

In RunPod, go to your Pod settings and expose the following ports:
- 8080 (Orchestrator -- this is what Railway calls)
- 6333 (Qdrant REST -- for admin/debugging only, can be restricted)

Note the public proxy URLs RunPod generates for each port.
Record these -- they become Railway environment variables in Step 4
of the overall PoC build plan.

---

## VRAM allocation summary (single RTX A6000 48GB)

    vx-llm (Qwen 2.5-32B, 4-bit GPTQ)    ~21GB  (45% utilisation cap)
    vx-embedding (Qwen3-Embedding-4B)      ~8GB   (TEI auto-managed)
    vx-reranker (Qwen3-Reranker-8B)        ~5GB   (TEI auto-managed)
    KV cache + CUDA overhead               ~10GB
    Headroom                               ~4GB

If VRAM contention occurs, reduce vLLM --gpu-memory-utilization to 0.40
in docker-compose.yaml and redeploy.

---

## Stopping and restarting

Stop all services (preserves volumes):
    docker compose down

Restart (uses cached model weights):
    docker compose up -d

Full reset including volumes (deletes vector store data):
    docker compose down -v
