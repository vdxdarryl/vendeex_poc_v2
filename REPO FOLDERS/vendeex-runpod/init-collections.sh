#!/bin/bash
# init-collections.sh
# VX-029-CAP-LLM: Qdrant Collection Initialisation
# Run once after first deployment, after Qdrant passes health check.
# 05/03/2026 | (c) 2026 Vendee Labs Limited

QDRANT_URL="http://localhost:6333"
DIMENSIONS=768

echo "=== VX-029 Qdrant Collection Initialisation ==="
echo "Target: ${QDRANT_URL}"
echo "Embedding dimensions: ${DIMENSIONS}"
echo ""

# Verify Qdrant is reachable
echo "Checking Qdrant health..."
if ! curl -sf "${QDRANT_URL}/healthz" > /dev/null; then
    echo "ERROR: Qdrant is not reachable at ${QDRANT_URL}"
    echo "Ensure the vx-qdrant container is running and healthy."
    exit 1
fi
echo "Qdrant is healthy."
echo ""

# ------------------------------------------------------------
# Member history collection
# Stores per-member conversational transcripts as embeddings.
# Filtered by member_id payload for individual retrieval.
# ------------------------------------------------------------
echo "Creating member_history collection..."
RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "${QDRANT_URL}/collections/member_history" \
  -H "Content-Type: application/json" \
  -d "{
    \"vectors\": {
      \"size\": ${DIMENSIONS},
      \"distance\": \"Cosine\"
    },
    \"on_disk_payload\": true
  }")

if [ "$RESULT" = "200" ] || [ "$RESULT" = "201" ]; then
    echo "member_history collection created."
else
    echo "WARNING: member_history returned HTTP ${RESULT} -- may already exist."
fi

# Create member_id payload index for filtered retrieval
echo "Creating member_id index on member_history..."
RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "${QDRANT_URL}/collections/member_history/index" \
  -H "Content-Type: application/json" \
  -d '{
    "field_name": "member_id",
    "field_schema": "keyword"
  }')

if [ "$RESULT" = "200" ] || [ "$RESULT" = "201" ]; then
    echo "member_id index created."
else
    echo "WARNING: member_id index returned HTTP ${RESULT}"
fi
echo ""

# ------------------------------------------------------------
# Population patterns collection
# Stores anonymised behavioural patterns from aggregated
# member interactions. No member-level filtering applied.
# ------------------------------------------------------------
echo "Creating population_patterns collection..."
RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "${QDRANT_URL}/collections/population_patterns" \
  -H "Content-Type: application/json" \
  -d "{
    \"vectors\": {
      \"size\": ${DIMENSIONS},
      \"distance\": \"Cosine\"
    },
    \"on_disk_payload\": true
  }")

if [ "$RESULT" = "200" ] || [ "$RESULT" = "201" ]; then
    echo "population_patterns collection created."
else
    echo "WARNING: population_patterns returned HTTP ${RESULT} -- may already exist."
fi
echo ""

# Verify both collections exist
echo "Verifying collections..."
curl -s "${QDRANT_URL}/collections" | python3 -c "
import sys, json
data = json.load(sys.stdin)
collections = [c['name'] for c in data.get('result', {}).get('collections', [])]
print(f'Collections found: {collections}')
required = {'member_history', 'population_patterns'}
missing = required - set(collections)
if missing:
    print(f'ERROR: Missing collections: {missing}')
    sys.exit(1)
else:
    print('All required collections present.')
"

echo ""
echo "=== Initialisation complete ==="
