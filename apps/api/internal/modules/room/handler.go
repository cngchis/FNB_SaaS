package room

import (
	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
)

func RegisterRoutes(api *gin.RouterGroup, pool *pgxpool.Pool) {
	routes := api.Group("/rooms")
	routes.GET("", func(c *gin.Context) {
		identity, _ := auth.CurrentIdentity(c)
		var rows []dbgen.ListRoomsRow
		var store pgtype.UUID
		_ = store.Scan(identity.StoreID)
		err := database.WithTenantQueries(c.Request.Context(), pool, identity.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			var err error
			rows, err = q.ListRooms(c.Request.Context(), dbgen.ListRoomsParams{TenantID: t, StoreID: store})
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		httpx.Success(c, 200, rows)
	})
	write := func(c *gin.Context) {
		identity, _ := auth.CurrentIdentity(c)
		var store, id pgtype.UUID
		_ = store.Scan(identity.StoreID)
		if c.Request.Method != "POST" {
			var ok bool
			id, ok = httpx.PathUUID(c)
			if !ok {
				return
			}
		}
		var in struct {
			Name string `json:"name" binding:"required,max=120"`
			Note string `json:"note" binding:"max=4000"`
		}
		if c.Request.Method != "DELETE" {
			if !httpx.BindJSON(c, &in) {
				return
			}
			in.Name = strings.TrimSpace(in.Name)
			if in.Name == "" || strings.EqualFold(in.Name, "Mang về") {
				httpx.HandleError(c, httpx.Invalid("Choose a room name other than the built-in takeaway option."))
				return
			}
		}
		var result dbgen.Room
		err := database.WithTenantQueries(c.Request.Context(), pool, identity.TenantID, func(q *dbgen.Queries, t pgtype.UUID) error {
			var err error
			if id.Valid {
				if _, err = q.GetRoom(c.Request.Context(), dbgen.GetRoomParams{TenantID: t, StoreID: store, ID: id}); err != nil {
					return err
				}
			}
			switch c.Request.Method {
			case "DELETE":
				count, err := q.DeleteRoom(c.Request.Context(), dbgen.DeleteRoomParams{TenantID: t, StoreID: store, ID: id})
				if err != nil {
					return err
				}
				if count == 0 {
					return &httpx.PublicError{Status: 409, Code: "room_occupied", Message: "Settle or cancel the open order before deleting its room."}
				}
				return nil
			case "PUT":
				result, err = q.UpdateRoom(c.Request.Context(), dbgen.UpdateRoomParams{TenantID: t, StoreID: store, ID: id, Name: in.Name, Note: in.Note})
			default:
				result, err = q.CreateRoom(c.Request.Context(), dbgen.CreateRoomParams{TenantID: t, StoreID: store, Name: in.Name, Note: in.Note})
			}
			return err
		})
		if err != nil {
			httpx.HandleError(c, err)
			return
		}
		if c.Request.Method == "DELETE" {
			httpx.Success(c, 200, gin.H{"deleted": true})
			return
		}
		status := 200
		if c.Request.Method == "POST" {
			status = 201
		}
		httpx.Success(c, status, result)
	}
	routes.POST("", auth.RequireRoles("owner", "manager"), write)
	routes.PUT("/:id", auth.RequireRoles("owner", "manager"), write)
	routes.DELETE("/:id", auth.RequireRoles("owner", "manager"), write)
}
