#!/bin/bash
# test-layers.sh
# VX-029-CAP-LLM: Stack Verification Tests
# Run after all five services are healthy.
# Tests each layer with a minimal request to confirm API is responding.
# 05/03/2026 | (c) 2026 Vendee Labs Limited
#
# Usage: bash test-layers.sh
# Requires: VX_LLM_API_KEY environment variable or pass as argument
# Example: VX_LLM_API_KEY=yourkey bash test-layers.sh

LLM_API_KEY="${VX_LLM_API_KEY:-$1}"

echo "=== VX-029 Stack Verification ==="
echo ""

PASS=0
FAIL=0

check() {
    local label="$1"
    local result="$2"
    local expected="$3"

    if echo "$result" | grep -q "$expected"; then
        echo "[PASS] ${label}"
        PASS=$((PASS + 1))
    else
        echo "[FAIL] ${label}"
        echo "       Response: ${result:0:200}"
        FAIL=$((FAIL + 1))
    fi
}

# ------------------------------------------------------------
# Qdrant health
# ------------------------------------------------------------
echo "--- Qdrant (Vector Store) ---"
RESULT=$(curl -s "http://localhost:6333/healthz")
check "Qdrant health endpoint" "$RESULT" "ok"

RESULT=$(curl -s "http://localhost:6333/collections")
check "Qdrant collections API" "$RESULT" "member_history"

echo ""

# ------------------------------------------------------------
# Layer 1: Embedding
# ------------------------------------------------------------
echo "--- Layer 1: Embedding (Qwen3-Embedding-4B) ---"
RESULT=$(curl -s "http://localhost:8001/health")
check "TEI Embedding health" "$RESULT" "."

RESULT=$(curl -s -X POST "http://localhost:8001/embed" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "test embedding request from VX-029 verification"}')
check "TEI Embedding /embed endpoint" "$RESULT" "["

echo ""

# ------------------------------------------------------------
# Layer 2: Reranker
# ------------------------------------------------------------
echo "--- Layer 2: Reranker (Qwen3-Reranker-8B) ---"
RESULT=$(curl -s "http://localhost:8002/health")
check "TEI Reranker health" "$RESULT" "."

RESULT=$(curl -s -X POST "http://localhost:8002/rerank" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "running shoes for trail",
    "texts": [
      "Nike trail running shoes waterproof",
      "Kitchen blender stainless steel",
      "Adidas ultraboost trail runners"
    ]
  }')
check "TEI Reranker /rerank endpoint" "$RESULT" "score"

echo ""

# ------------------------------------------------------------
# Layer 3: LLM (vLLM / Qwen 2.5-32B)
# ------------------------------------------------------------
echo "--- Layer 3: LLM (Qwen 2.5-32B via vLLM) ---"
RESULT=$(curl -s "http://localhost:8000/health")
check "vLLM health endpoint" "$RESULT" "."

if [ -z "$LLM_API_KEY" ]; then
    echo "[SKIP] vLLM chat completions -- VX_LLM_API_KEY not set"
    echo "       Run: VX_LLM_API_KEY=yourkey bash test-layers.sh"
else
    RESULT=$(curl -s -X POST "http://localhost:8000/v1/chat/completions" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${LLM_API_KEY}" \
      -d '{
        "model": "Qwen/Qwen2.5-32B-Instruct-GPTQ-Int4",
        "messages": [{"role": "user", "content": "Reply with the single word: ready"}],
        "max_tokens": 10
      }')
    check "vLLM chat completions" "$RESULT" "choices"
fi

echo ""

# ------------------------------------------------------------
# Orchestrator
# ------------------------------------------------------------
echo "--- Orchestrator (PoC Placeholder) ---"
RESULT=$(curl -s "http://localhost:8080/health")
check "Orchestrator health" "$RESULT" "healthy"

RESULT=$(curl -s "http://localhost:8080/status")
check "Orchestrator /status (all services)" "$RESULT" "stack_ready"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [ "$FAIL" -gt 0 ]; then
    echo "Review failures above. Check container logs:"
    echo "  docker compose logs vx-llm"
    echo "  docker compose logs vx-embedding"
    echo "  docker compose logs vx-reranker"
    echo "  docker compose logs vx-qdrant"
    echo "  docker compose logs vx-orchestrator"
    exit 1
else
    echo "All layers verified. Stack is ready."
fi
