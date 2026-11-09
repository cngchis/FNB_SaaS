package customer

import (
	"strings"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
)

type Input struct {
	Name    string  `json:"name" binding:"required,max=200"`
	Phone   *string `json:"phone" binding:"omitempty,max=40"`
	Email   *string `json:"email" binding:"omitempty,email,max=254"`
	Note    *string `json:"note" binding:"omitempty,max=4000"`
	GroupID *string `json:"group_id" binding:"omitempty,uuid"`
	Points  *int64  `json:"points" binding:"omitempty,min=0,max=9007199254740991"`
}

func (in *Input) Normalize() error {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return httpx.Invalid("Customer name cannot be blank.")
	}
	return nil
}

type GroupInput struct {
	Name      string `json:"name" binding:"required,max=120"`
	Condition string `json:"condition" binding:"max=2000"`
	Benefit   string `json:"benefit" binding:"max=2000"`
	IsActive  *bool  `json:"is_active"`
}
type ListFilter struct {
	httpx.ListQuery
	GroupID *string `form:"group_id" binding:"omitempty,uuid"`
}
