#!/bin/bash
# Load test: simulates burst of comments claiming a product
# Usage: ./test/load_test.sh
# Prerequisites: backend running on :8080

set -e

API="http://localhost:8080"

echo "=== Creating a product with stock=5 ==="
PRODUCT=$(curl -s -X POST "$API/products/live" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Hoodie","size":"L","color":"Black","price":49.99,"stock":5}')

echo "$PRODUCT" | python3 -m json.tool 2>/dev/null || echo "$PRODUCT"

CLAIM_CODE=$(echo "$PRODUCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['claimCode'])")
echo ""
echo "=== Claim code: $CLAIM_CODE ==="
echo "=== Sending 20 concurrent claims (stock=5, expect 5 success, 15 sold out) ==="
echo ""

# Fire 20 concurrent requests
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "Comment $i: HTTP %{http_code}\n" \
    -X POST "$API/comments" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$CLAIM_CODE 0900000${i}\",\"user\":\"user${i}\"}" &
done

wait

echo ""
echo "=== Checking orders ==="
ORDERS=$(curl -s "$API/orders")
ORDER_COUNT=$(echo "$ORDERS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Total orders created: $ORDER_COUNT (should be 5)"

echo ""
echo "=== Checking product stock ==="
PRODUCTS=$(curl -s "$API/products/active")
echo "$PRODUCTS" | python3 -m json.tool 2>/dev/null || echo "$PRODUCTS"

echo ""
echo "=== Load test complete ==="
