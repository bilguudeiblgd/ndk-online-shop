# Live Selling System

Real-time live-selling system for Facebook Live streams. Operators create products, generate claim codes, and process incoming comments to manage inventory and orders in real time.

## Architecture

- **Backend**: Go with chi router, gorilla/websocket
- **Frontend**: Next.js (App Router, TypeScript, Tailwind)
- **Realtime**: WebSocket broadcast from Go to Next.js
- **Storage**: In-memory (structured for Postgres swap)

## Running

### Backend (Go)

```bash
cd backend
go run cmd/server/main.go
# Server starts on :8080
```

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000/live
```

## API Endpoints

### Create a product (go live)
```bash
curl -X POST http://localhost:8080/products/live \
  -H "Content-Type: application/json" \
  -d '{"name":"Summer Dress","size":"M","color":"Red","price":35.00,"stock":10}'
```

### Get active products
```bash
curl http://localhost:8080/products/active
```

### End a product
```bash
curl -X POST http://localhost:8080/products/{id}/end
```

### Simulate a Facebook comment (claim)
```bash
# Format: "<claim_code> <phone_number>"
curl -X POST http://localhost:8080/comments \
  -H "Content-Type: application/json" \
  -d '{"text":"42 09012345678","user":"buyer1"}'
```

### Get all orders
```bash
curl http://localhost:8080/orders
```

### Pay an order
```bash
curl -X POST http://localhost:8080/orders/{id}/pay
```

## Load Test

```bash
cd backend
./test/load_test.sh
```

Creates a product with stock=5, fires 20 concurrent claims, and verifies exactly 5 orders are created (no overselling).

## How It Works

1. Operator creates a product via the dashboard — a claim code (0–99) is auto-generated
2. The claim code is displayed large on screen during the live stream
3. Viewers comment with `<code> <phone>` on Facebook
4. Comments are ingested via `POST /comments` (mock endpoint, replaceable with Facebook Graph API)
5. System atomically reserves stock and creates orders
6. All UI updates happen in real-time via WebSocket
7. Orders expire after 10 minutes if not paid, releasing stock back

## Testing

```bash
cd backend
go test ./... -race
```
