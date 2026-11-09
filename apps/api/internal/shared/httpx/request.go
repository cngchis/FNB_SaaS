package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rs/zerolog/log"
)

type PublicError struct {
	Status        int
	Code, Message string
}

func (e *PublicError) Error() string { return e.Message }
func Invalid(message string) error {
	return &PublicError{http.StatusUnprocessableEntity, "invalid_data", message}
}
func Missing() error {
	return &PublicError{http.StatusNotFound, "not_found", "The requested record was not found."}
}

func BindJSON(c *gin.Context, target any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		Fail(c, 400, "invalid_request", "Provide a valid JSON body with supported fields.")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		Fail(c, 400, "invalid_request", "Provide exactly one JSON object.")
		return false
	}
	if err := binding.Validator.ValidateStruct(target); err != nil {
		Fail(c, 422, "invalid_data", "Check the required fields and their allowed values.")
		return false
	}
	return true
}

func PathUUID(c *gin.Context) (pgtype.UUID, bool) {
	var id pgtype.UUID
	if err := id.Scan(c.Param("id")); err != nil || !id.Valid {
		Fail(c, 400, "invalid_id", "Provide a valid record UUID.")
		return id, false
	}
	return id, true
}

func HandleError(c *gin.Context, err error) {
	var public *PublicError
	var database *pgconn.PgError
	switch {
	case errors.As(err, &public):
		Fail(c, public.Status, public.Code, public.Message)
	case errors.Is(err, pgx.ErrNoRows):
		Fail(c, 404, "not_found", "The requested record was not found.")
	case errors.As(err, &database) && database.Code == "23505":
		Fail(c, 409, "record_conflict", "A record with these unique values already exists.")
	case errors.As(err, &database) && (database.Code == "23503" || database.Code == "23514" || database.Code == "22003"):
		Fail(c, 422, "invalid_data", "Check the related records and allowed field values.")
	default:
		log.Error().Err(err).Str("request_id", c.GetString("request_id")).Msg("module request failed")
		Fail(c, 500, "internal_error", "Unable to complete this request.")
	}
}

type ListQuery struct {
	Page      int32  `form:"page" binding:"omitempty,min=1,max=1000000"`
	PageSize  int32  `form:"page_size" binding:"omitempty,min=1,max=100"`
	Search    string `form:"search" binding:"max=200"`
	Sort      string `form:"sort"`
	Direction string `form:"direction" binding:"omitempty,oneof=asc desc"`
}

func (q *ListQuery) Normalize(allowed ...string) error {
	if q.Page == 0 {
		q.Page = 1
	}
	if q.PageSize == 0 {
		q.PageSize = 20
	}
	if q.Sort == "" {
		q.Sort = "name"
	}
	if q.Direction == "" {
		q.Direction = "asc"
	}
	for _, key := range allowed {
		if q.Sort == key {
			return nil
		}
	}
	return Invalid("Unsupported sort field.")
}
func (q ListQuery) Offset() int32 { return (q.Page - 1) * q.PageSize }
func (q ListQuery) Pattern() string {
	return "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(strings.TrimSpace(q.Search)) + "%"
}

type Pagination struct {
	Page       int32 `json:"page"`
	PageSize   int32 `json:"page_size"`
	Total      int64 `json:"total"`
	TotalPages int64 `json:"total_pages"`
}

func (q ListQuery) Pagination(total int64) Pagination {
	return Pagination{q.Page, q.PageSize, total, (total + int64(q.PageSize) - 1) / int64(q.PageSize)}
}
func NullableText(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: strings.TrimSpace(*s), Valid: true}
}
func NullableInt(n *int64) pgtype.Int8 {
	if n == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *n, Valid: true}
}
func OptionalUUID(s *string) pgtype.UUID {
	var id pgtype.UUID
	if s != nil {
		_ = id.Scan(*s)
	}
	return id
}
func Bool(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}
