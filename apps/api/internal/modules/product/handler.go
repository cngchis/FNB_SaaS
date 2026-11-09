package product

import (
	"net/http"
	"strings"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct{ service Service }

func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	h := Handler{Service{pool}}
	products := api.Group("/products")
	products.GET("", h.list)
	products.GET("/:id", h.get)
	products.POST("", auth.RequireRoles("owner", "manager"), h.save)
	products.PUT("/:id", auth.RequireRoles("owner", "manager"), h.save)
	products.DELETE("/:id", auth.RequireRoles("owner", "manager"), h.delete)
	categories := api.Group("/product-categories")
	categories.GET("", h.categories)
	categories.GET("/:id", h.category)
	categories.POST("", auth.RequireRoles("owner", "manager"), h.saveCategory)
	categories.PUT("/:id", auth.RequireRoles("owner", "manager"), h.saveCategory)
	categories.DELETE("/:id", auth.RequireRoles("owner", "manager"), h.deleteCategory)
}
func tenant(c *gin.Context) string { identity, _ := auth.CurrentIdentity(c); return identity.TenantID }
func (h Handler) list(c *gin.Context) {
	var filter ListFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		httpx.Fail(c, 400, "invalid_filter", "Check pagination and filter values.")
		return
	}
	if err := filter.Normalize("name", "sku", "price_vnd", "created_at"); err != nil {
		httpx.HandleError(c, err)
		return
	}
	result, err := h.service.List(c.Request.Context(), tenant(c), filter)
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, result)
}
func (h Handler) get(c *gin.Context) {
	id, ok := httpx.PathUUID(c)
	if !ok {
		return
	}
	result, err := h.service.Get(c.Request.Context(), tenant(c), id)
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, result)
}
func (h Handler) save(c *gin.Context) {
	var id pgtype.UUID
	if c.Request.Method == http.MethodPut {
		var ok bool
		id, ok = httpx.PathUUID(c)
		if !ok {
			return
		}
	}
	var in Input
	if !httpx.BindJSON(c, &in) {
		return
	}
	if err := in.Normalize(); err != nil {
		httpx.HandleError(c, err)
		return
	}
	result, err := h.service.Save(c.Request.Context(), tenant(c), id, in)
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	status := 200
	if !id.Valid {
		status = 201
	}
	httpx.Success(c, status, result)
}
func (h Handler) delete(c *gin.Context) {
	id, ok := httpx.PathUUID(c)
	if !ok {
		return
	}
	if err := h.service.Delete(c.Request.Context(), tenant(c), id); err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, gin.H{"deleted": true})
}
func (h Handler) categories(c *gin.Context) {
	result, err := h.service.Categories(c.Request.Context(), tenant(c))
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, result)
}

func (h Handler) category(c *gin.Context) {
	id, ok := httpx.PathUUID(c)
	if !ok {
		return
	}
	result, err := h.service.Category(c.Request.Context(), tenant(c), id)
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, result)
}
func (h Handler) saveCategory(c *gin.Context) {
	var id pgtype.UUID
	if c.Request.Method == http.MethodPut {
		var ok bool
		id, ok = httpx.PathUUID(c)
		if !ok {
			return
		}
	}
	var in CategoryInput
	if !httpx.BindJSON(c, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		httpx.HandleError(c, httpx.Invalid("Category name cannot be blank."))
		return
	}
	result, err := h.service.SaveCategory(c.Request.Context(), tenant(c), id, in.Name)
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	status := 200
	if !id.Valid {
		status = 201
	}
	httpx.Success(c, status, result)
}
func (h Handler) deleteCategory(c *gin.Context) {
	id, ok := httpx.PathUUID(c)
	if !ok {
		return
	}
	if err := h.service.DeleteCategory(c.Request.Context(), tenant(c), id); err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, gin.H{"deleted": true})
}
