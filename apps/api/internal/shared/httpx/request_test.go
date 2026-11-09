package httpx

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStrictJSONAndIntegerMoney(t *testing.T) {
	cases := []struct {
		body   string
		status int
	}{
		{`{"price_vnd":0}`, 200},
		{`{"price_vnd":35000}`, 200},
		{`{"price_vnd":35.5}`, 400},
		{`{"price_vnd":35000,"tenant_id":"spoofed"}`, 400},
		{`{"price_vnd":35000} {"price_vnd":1}`, 400},
		{`{"price_vnd":-1}`, 422},
		{`{}`, 422},
		{`null`, 422},
	}
	router := gin.New()
	router.POST("/", func(c *gin.Context) {
		var input struct {
			Price *int64 `json:"price_vnd" binding:"required,min=0"`
		}
		if BindJSON(c, &input) {
			Success(c, 200, input)
		}
	})
	for _, tc := range cases {
		t.Run(tc.body, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(response, request)
			if response.Code != tc.status {
				t.Fatalf("status=%d, want %d", response.Code, tc.status)
			}
		})
	}
}

func TestPaginationAndLiteralSearch(t *testing.T) {
	q := ListQuery{Search: `50%_\`}
	if err := q.Normalize("name"); err != nil {
		t.Fatal(err)
	}
	if q.Page != 1 || q.PageSize != 20 || q.Offset() != 0 || q.Pattern() != `%50\%\_\\%` {
		t.Fatalf("unexpected paging/search: %+v pattern=%q", q, q.Pattern())
	}
	if q.Pagination(21).TotalPages != 2 {
		t.Fatal("page count rounded incorrectly")
	}
	q.Sort = "name; DROP TABLE products"
	if q.Normalize("name") == nil {
		t.Fatal("unsupported sort accepted")
	}
}
