package product

import (
	"net/url"
	"regexp"
	"strings"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
)

type AttributeInput struct {
	Name          string `json:"name" binding:"required,max=80"`
	Value         string `json:"value" binding:"required,max=120"`
	PriceDeltaVND int64  `json:"price_delta_vnd" binding:"min=-9007199254740991,max=9007199254740991"`
}
type UnitInput struct {
	IsVisible *bool  `json:"is_visible"`
	Name      string `json:"name" binding:"required,max=80"`
	Ratio     string `json:"ratio" binding:"required"`
	PriceVND  *int64 `json:"price_vnd" binding:"required,min=0,max=9007199254740991"`
	CostVND   *int64 `json:"cost_vnd" binding:"omitempty,min=0,max=9007199254740991"`
}
type Input struct {
	Name         string           `json:"name" binding:"required,max=200"`
	CategoryID   *string          `json:"category_id" binding:"omitempty,uuid"`
	ProductType  string           `json:"product_type" binding:"required,oneof=goods prepared"`
	MenuType     string           `json:"menu_type" binding:"omitempty,oneof=drink food other"`
	BaseUnit     string           `json:"base_unit" binding:"max=80"`
	PriceVND     *int64           `json:"price_vnd" binding:"required,min=0,max=9007199254740991"`
	CostVND      *int64           `json:"cost_vnd" binding:"omitempty,min=0,max=9007199254740991"`
	TracksStock  *bool            `json:"tracks_stock"`
	IsVisible    *bool            `json:"is_visible"`
	IsExtra      *bool            `json:"is_extra"`
	EarnsPoints  *bool            `json:"earns_points"`
	Availability string           `json:"availability" binding:"omitempty,oneof=available unavailable"`
	ImageURL     *string          `json:"image_url" binding:"omitempty,max=2048"`
	Attributes   []AttributeInput `json:"attributes" binding:"max=50,dive"`
	Units        []UnitInput      `json:"units" binding:"max=50,dive"`
}

var ratioPattern = regexp.MustCompile(`^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,3})?$`)

func (in *Input) Normalize() error {
	in.Name = strings.TrimSpace(in.Name)
	in.BaseUnit = strings.TrimSpace(in.BaseUnit)
	if in.Name == "" {
		return httpx.Invalid("Product name cannot be blank.")
	}
	if in.PriceVND == nil {
		return httpx.Invalid("Product price is required.")
	}
	if in.BaseUnit == "" {
		in.BaseUnit = "Cái"
	}
	if in.MenuType == "" {
		in.MenuType = "other"
	}
	if in.Availability == "" {
		in.Availability = "available"
	}
	if in.ProductType == "prepared" && (in.CostVND != nil || httpx.Bool(in.TracksStock, false)) {
		return httpx.Invalid("Prepared products cannot set a manual cost or track product stock.")
	}
	if in.ImageURL != nil && *in.ImageURL != "" {
		u, err := url.Parse(*in.ImageURL)
		if err != nil || u.User != nil || strings.Contains(*in.ImageURL, "\\") || !((u.Scheme == "https" || u.Scheme == "http") && u.Host != "" || u.Scheme == "" && u.Host == "" && strings.HasPrefix(u.Path, "/")) {
			return httpx.Invalid("Image URL must be an HTTP URL or an absolute asset path.")
		}
	}
	seen := map[string]bool{}
	for i := range in.Attributes {
		a := &in.Attributes[i]
		a.Name = strings.TrimSpace(a.Name)
		a.Value = strings.TrimSpace(a.Value)
		key := strings.ToLower(a.Name) + "\x00" + strings.ToLower(a.Value)
		if a.PriceDeltaVND < -*in.PriceVND {
			return httpx.Invalid("Attribute price adjustment cannot make the product price negative.")
		}
		if a.Name == "" || a.Value == "" || seen[key] {
			return httpx.Invalid("Attributes must have unique, nonblank name/value pairs.")
		}
		seen[key] = true
	}
	seen = map[string]bool{}
	for i := range in.Units {
		u := &in.Units[i]
		u.Name = strings.TrimSpace(u.Name)
		key := strings.ToLower(u.Name)
		if u.Name == "" || strings.EqualFold(u.Name, in.BaseUnit) || seen[key] || !ratioPattern.MatchString(u.Ratio) || strings.Trim(u.Ratio, "0.") == "" {
			return httpx.Invalid("Units need unique names and a positive ratio with at most three decimal places.")
		}
		if in.ProductType == "prepared" && u.CostVND != nil {
			return httpx.Invalid("Prepared product units cannot set manual costs.")
		}
		seen[key] = true
	}
	return nil
}

type CategoryInput struct {
	Name string `json:"name" binding:"required,max=120"`
}
type ListFilter struct {
	httpx.ListQuery
	CategoryID   *string `form:"category_id" binding:"omitempty,uuid"`
	ProductType  string  `form:"product_type" binding:"omitempty,oneof=goods prepared"`
	Availability string  `form:"availability" binding:"omitempty,oneof=available unavailable"`
}
type Item struct {
	dbgen.Product
	CategoryName *string                `json:"category_name"`
	Attributes   []dbgen.ProductVariant `json:"attributes"`
	Units        []dbgen.ProductUnit    `json:"units"`
}
type Page struct {
	Items      []Item           `json:"items"`
	Pagination httpx.Pagination `json:"pagination"`
}
