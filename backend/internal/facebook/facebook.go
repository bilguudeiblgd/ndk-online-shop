package facebook

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

const graphBaseURL = "https://graph.facebook.com/v19.0"

type LiveVideo struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Status      string `json:"status"`
	Description string `json:"description"`
}

type FBComment struct {
	ID        string    `json:"id"`
	Message   string    `json:"message"`
	From      FBUser    `json:"from"`
	CreatedAt time.Time `json:"created_time"`
}

type FBUser struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// CommentHandler is called for each new comment found.
type CommentHandler func(text, user string)

// Client manages Facebook API interactions and comment polling.
type Client struct {
	mu sync.RWMutex

	// Token set directly by the operator
	pageAccessToken string

	// Polling state
	activeVideoID string
	stopPolling   chan struct{}
	polling       bool
	seenComments  map[string]bool
	onComment     CommentHandler
}

func NewClient() *Client {
	return &Client{
		seenComments: make(map[string]bool),
	}
}

// SetToken sets the page access token directly.
func (c *Client) SetToken(token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pageAccessToken = token
}

func (c *Client) GetToken() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.pageAccessToken
}

func (c *Client) IsConnected() bool {
	return c.GetToken() != ""
}

// GetLiveVideos fetches live videos for a page using the token.
func (c *Client) GetLiveVideos(pageID string) ([]LiveVideo, error) {
	token := c.GetToken()
	if token == "" {
		return nil, fmt.Errorf("no access token set")
	}

	url := fmt.Sprintf("%s/%s/live_videos?fields=id,title,status,description&status=LIVE&access_token=%s",
		graphBaseURL, pageID, token)

	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("fetch live videos failed (%d): %s", resp.StatusCode, body)
	}

	var result struct {
		Data []LiveVideo `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result.Data, nil
}

// StartPolling begins polling comments on a live video.
func (c *Client) StartPolling(videoID string, handler CommentHandler) error {
	token := c.GetToken()
	if token == "" {
		return fmt.Errorf("no access token set")
	}

	c.mu.Lock()
	if c.polling {
		close(c.stopPolling)
	}
	c.activeVideoID = videoID
	c.stopPolling = make(chan struct{})
	c.polling = true
	c.seenComments = make(map[string]bool)
	c.onComment = handler
	c.mu.Unlock()

	go c.pollLoop(videoID, token)
	return nil
}

// StopPolling stops the comment polling loop.
func (c *Client) StopPolling() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.polling {
		close(c.stopPolling)
		c.polling = false
		c.activeVideoID = ""
	}
}

func (c *Client) IsPolling() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.polling
}

func (c *Client) ActiveVideoID() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.activeVideoID
}

func (c *Client) pollLoop(videoID, token string) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	log.Printf("[facebook] started polling comments for video %s", videoID)
	c.fetchAndProcessComments(videoID, token)

	for {
		select {
		case <-c.stopPolling:
			log.Printf("[facebook] stopped polling video %s", videoID)
			return
		case <-ticker.C:
			c.fetchAndProcessComments(videoID, token)
		}
	}
}

func (c *Client) fetchAndProcessComments(videoID, token string) {
	url := fmt.Sprintf("%s/%s/comments?fields=id,message,from,created_time&order=reverse_chronological&limit=50&access_token=%s",
		graphBaseURL, videoID, token)

	resp, err := http.Get(url)
	if err != nil {
		log.Printf("[facebook] error fetching comments: %v", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		log.Printf("[facebook] comments API error (%d): %s", resp.StatusCode, body)
		return
	}

	var result struct {
		Data []FBComment `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		log.Printf("[facebook] parse comments error: %v", err)
		return
	}

	c.mu.Lock()
	handler := c.onComment
	var newComments []FBComment
	for _, comment := range result.Data {
		if !c.seenComments[comment.ID] {
			c.seenComments[comment.ID] = true
			newComments = append(newComments, comment)
		}
	}
	c.mu.Unlock()

	for _, comment := range newComments {
		userName := comment.From.Name
		if userName == "" {
			userName = comment.From.ID
		}
		log.Printf("[facebook] new comment from %s: %s", userName, comment.Message)
		if handler != nil {
			handler(comment.Message, userName)
		}
	}
}
