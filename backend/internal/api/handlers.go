package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"

	"live-selling/internal/service"

	"github.com/go-chi/chi/v5"
)

type Handlers struct {
	svc *service.LiveService
}

func NewHandlers(svc *service.LiveService) *Handlers {
	return &Handlers{svc: svc}
}

type createProductReq struct {
	Name  string  `json:"name"`
	Size  string  `json:"size"`
	Color string  `json:"color"`
	Price float64 `json:"price"`
	Stock int     `json:"stock"`
}

type commentReq struct {
	Text string `json:"text"`
	User string `json:"user"`
}

func (h *Handlers) CreateProduct(w http.ResponseWriter, r *http.Request) {
	var req createProductReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Stock <= 0 || req.Price <= 0 {
		http.Error(w, "name, stock > 0, and price > 0 required", http.StatusBadRequest)
		return
	}

	p, err := h.svc.CreateProduct(req.Name, req.Size, req.Color, req.Price, req.Stock)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

func (h *Handlers) GetActiveProducts(w http.ResponseWriter, r *http.Request) {
	products := h.svc.GetActiveProducts()
	w.Header().Set("Content-Type", "application/json")
	if products == nil {
		w.Write([]byte("[]"))
		return
	}
	json.NewEncoder(w).Encode(products)
}

func (h *Handlers) EndProduct(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	p, err := h.svc.EndProduct(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func (h *Handlers) GetOrders(w http.ResponseWriter, r *http.Request) {
	orders := h.svc.GetOrders()
	w.Header().Set("Content-Type", "application/json")
	if orders == nil {
		w.Write([]byte("[]"))
		return
	}
	json.NewEncoder(w).Encode(orders)
}

func (h *Handlers) PostComment(w http.ResponseWriter, r *http.Request) {
	var req commentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	order, err := h.svc.ProcessComment(req.Text, req.User)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(order)
}

// Webhook endpoint for Make.com / Integromat.
// Accepts a single comment object or an array of comments.
// Expected shape per comment: { "message": "42 09012345678", "from": {"id": "...", "name": "..."}, "created_time": "..." }
func (h *Handlers) Webhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	log.Printf("[webhook] received: %s", string(body))

	// Determine if it's an array or single object
	trimmed := bytes.TrimSpace(body)
	var comments []webhookComment

	if len(trimmed) > 0 && trimmed[0] == '[' {
		// Array of comments
		if err := json.Unmarshal(trimmed, &comments); err != nil {
			http.Error(w, "invalid JSON array", http.StatusBadRequest)
			return
		}
	} else {
		// Single comment
		var single webhookComment
		if err := json.Unmarshal(trimmed, &single); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		comments = []webhookComment{single}
	}

	var results []map[string]interface{}
	for _, c := range comments {
		text := c.Message
		user := c.From.Name
		if user == "" {
			user = c.From.ID
		}
		if user == "" {
			user = "facebook_user"
		}

		if text == "" {
			log.Printf("[webhook] skipped: empty message from %s", user)
			results = append(results, map[string]interface{}{"status": "skipped", "reason": "empty message"})
			continue
		}

		log.Printf("[webhook] comment from %s: %q", user, text)

		order, err := h.svc.ProcessComment(text, user)
		if err != nil {
			log.Printf("[webhook] skipped: %s (from %s: %q)", err, user, text)
			results = append(results, map[string]interface{}{"status": "skipped", "reason": err.Error(), "message": text, "user": user})
			continue
		}

		log.Printf("[webhook] ORDER CREATED: %s from %s", order.ID, user)
		results = append(results, map[string]interface{}{"status": "order_created", "order": order})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"processed": len(results),
		"results":   results,
	})
}

type webhookComment struct {
	Message     string       `json:"message"`
	From        webhookFrom  `json:"from"`
	CreatedTime string       `json:"created_time"`
}

type webhookFrom struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}


func (h *Handlers) PayOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	order, err := h.svc.PayOrder(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(order)
}
