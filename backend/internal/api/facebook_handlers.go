package api

import (
	"encoding/json"
	"log"
	"net/http"

	"live-selling/internal/facebook"
	"live-selling/internal/service"
)

type FacebookHandlers struct {
	fb  *facebook.Client
	svc *service.LiveService
}

func NewFacebookHandlers(fb *facebook.Client, svc *service.LiveService) *FacebookHandlers {
	return &FacebookHandlers{fb: fb, svc: svc}
}

// GetStatus returns the current Facebook connection state.
func (h *FacebookHandlers) GetStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"connected":     h.fb.IsConnected(),
		"polling":       h.fb.IsPolling(),
		"activeVideoId": h.fb.ActiveVideoID(),
	})
}

type setTokenReq struct {
	Token string `json:"token"`
}

// SetToken sets the page access token.
func (h *FacebookHandlers) SetToken(w http.ResponseWriter, r *http.Request) {
	var req setTokenReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		http.Error(w, "token required", http.StatusBadRequest)
		return
	}

	h.fb.SetToken(req.Token)
	log.Printf("[facebook] page access token set (length: %d)", len(req.Token))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GetLiveVideos returns live videos for a page.
func (h *FacebookHandlers) GetLiveVideos(w http.ResponseWriter, r *http.Request) {
	pageID := r.URL.Query().Get("page_id")
	if pageID == "" {
		http.Error(w, "page_id required", http.StatusBadRequest)
		return
	}

	videos, err := h.fb.GetLiveVideos(pageID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(videos)
}

type startPollingReq struct {
	VideoID string `json:"videoId"`
}

// StartPolling begins polling comments from a live video.
func (h *FacebookHandlers) StartPolling(w http.ResponseWriter, r *http.Request) {
	var req startPollingReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.VideoID == "" {
		http.Error(w, "videoId required", http.StatusBadRequest)
		return
	}

	err := h.fb.StartPolling(req.VideoID, func(text, user string) {
		order, err := h.svc.ProcessComment(text, user)
		if err != nil {
			log.Printf("[facebook] comment from %s (%q): %v", user, text, err)
			return
		}
		log.Printf("[facebook] order created from %s: %s", user, order.ID)
	})

	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "polling", "videoId": req.VideoID})
}

// StopPolling stops comment polling.
func (h *FacebookHandlers) StopPolling(w http.ResponseWriter, r *http.Request) {
	h.fb.StopPolling()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
}
