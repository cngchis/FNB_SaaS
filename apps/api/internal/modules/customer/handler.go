package customer

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
	customers := api.Group("/customers", auth.RequireRoles("owner", "manager", "cashier"))
	customers.GET("", h.list)
	customers.GET("/:id", h.get)
	customers.GET("/:id/debt", h.debt)
	customers.POST("", h.save)
	customers.PUT("/:id", h.save)
	customers.DELETE("/:id", auth.RequireRoles("owner", "manager"), h.delete)
	groups := api.Group("/customer-groups", auth.RequireRoles("owner", "manager", "cashier"))
	groups.GET("", h.groups)
	groups.GET("/:id", h.group)
	groups.POST("", auth.RequireRoles("owner", "manager"), h.saveGroup)
	groups.PUT("/:id", auth.RequireRoles("owner", "manager"), h.saveGroup)
	groups.DELETE("/:id", auth.RequireRoles("owner", "manager"), h.deleteGroup)
}
func (h Handler) list(c *gin.Context) {
	var filter ListFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		httpx.Fail(c, 400, "invalid_filter", "Check pagination and filter values.")
		return
	}
	if err := filter.Normalize("name", "points", "created_at"); err != nil {
		httpx.HandleError(c, err)
		return
	}
	identity, _ := auth.CurrentIdentity(c)
	result, err := h.service.List(c.Request.Context(), identity.TenantID, identity.StoreID, filter)
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
	identity, _ := auth.CurrentIdentity(c)
	result, err := h.service.Get(c.Request.Context(), identity.TenantID, identity.StoreID, id)
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
	identity, _ := auth.CurrentIdentity(c)
	if identity.Role == "cashier" && in.Points != nil {
		httpx.Fail(c, 403, "forbidden", "Only owners and managers can adjust loyalty points.")
		return
	}
	result, err := h.service.Save(c.Request.Context(), identity.TenantID, id, in)
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
	identity, _ := auth.CurrentIdentity(c)
	if err := h.service.Delete(c.Request.Context(), identity.TenantID, id); err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, gin.H{"deleted": true})
}
func (h Handler) groups(c *gin.Context) {
	identity, _ := auth.CurrentIdentity(c)
	result, err := h.service.Groups(c.Request.Context(), identity.TenantID)
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, result)
}

func (h Handler) group(c *gin.Context) {
	id, ok := httpx.PathUUID(c)
	if !ok {
		return
	}
	identity, _ := auth.CurrentIdentity(c)
	result, err := h.service.Group(c.Request.Context(), identity.TenantID, id)
	if err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, result)
}
func (h Handler) saveGroup(c *gin.Context) {
	var id pgtype.UUID
	if c.Request.Method == http.MethodPut {
		var ok bool
		id, ok = httpx.PathUUID(c)
		if !ok {
			return
		}
	}
	var in GroupInput
	if !httpx.BindJSON(c, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		httpx.HandleError(c, httpx.Invalid("Customer group name cannot be blank."))
		return
	}
	identity, _ := auth.CurrentIdentity(c)
	result, err := h.service.SaveGroup(c.Request.Context(), identity.TenantID, id, in)
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
func (h Handler) deleteGroup(c *gin.Context) {
	id, ok := httpx.PathUUID(c)
	if !ok {
		return
	}
	identity, _ := auth.CurrentIdentity(c)
	if err := h.service.DeleteGroup(c.Request.Context(), identity.TenantID, id); err != nil {
		httpx.HandleError(c, err)
		return
	}
	httpx.Success(c, 200, gin.H{"deleted": true})
}
