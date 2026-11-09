package middleware

import (
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

type RequestMetrics struct {
	mu     sync.Mutex
	counts map[string]uint64
}

func NewRequestMetrics() *RequestMetrics {
	return &RequestMetrics{counts: make(map[string]uint64)}
}

func (m *RequestMetrics) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		path := c.FullPath()
		if path == "" {
			path = "unmatched"
		}
		key := c.Request.Method + " " + path + " " + fmt.Sprint(c.Writer.Status())
		m.mu.Lock()
		m.counts[key]++
		m.mu.Unlock()
	}
}

func (m *RequestMetrics) Prometheus() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	keys := make([]string, 0, len(m.counts))
	for key := range m.counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var output strings.Builder
	output.WriteString("# HELP http_requests_total Total HTTP requests by method, route, and status.\n")
	output.WriteString("# TYPE http_requests_total counter\n")
	for _, key := range keys {
		parts := strings.SplitN(key, " ", 3)
		if len(parts) != 3 {
			continue
		}
		fmt.Fprintf(&output, "http_requests_total{method=%q,route=%q,status=%q} %d\n", parts[0], parts[1], parts[2], m.counts[key])
	}
	return output.String()
}
