package api

import (
	"encoding/json"
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
