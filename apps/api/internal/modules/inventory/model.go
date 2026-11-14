package inventory

import (
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"math/big"
	"regexp"
	"time"
)

var quantityPattern = regexp.MustCompile(`^(0|[1-9][0-9]{0,9})(\.[0-9]{1,6})?$`)

func ValidQuantity(s string) bool {
	r, ok := new(big.Rat).SetString(s)
	return quantityPattern.MatchString(s) && ok && r.Sign() >= 0 && r.Cmp(new(big.Rat).SetInt64(1000000000)) <= 0
}
func conflict(message string) error {
	return &httpx.PublicError{Status: 409, Code: "stocktake_conflict", Message: message}
}

type ItemInput struct {
	ProductID      string `json:"product_id" binding:"required,uuid"`
	Counted        string `json:"counted_quantity" binding:"required"`
	BalanceVersion int64  `json:"balance_version" binding:"min=0"`
}
type Input struct {
	Version int64       `json:"version" binding:"min=0"`
	Note    string      `json:"note" binding:"max=4000"`
	Items   []ItemInput `json:"items" binding:"required,min=1,max=500,dive"`
}
type Item struct {
	ID             string `json:"id"`
	ProductID      string `json:"product_id"`
	Name           string `json:"name"`
	SKU            string `json:"sku"`
	Unit           string `json:"unit"`
	System         string `json:"system_quantity"`
	Counted        string `json:"counted_quantity"`
	BalanceVersion int64  `json:"balance_version"`
}
type Stocktake struct {
	ID        string    `json:"id"`
	Code      string    `json:"code"`
	Status    string    `json:"status"`
	Note      string    `json:"note"`
	Version   int64     `json:"version"`
	Branch    string    `json:"branch"`
	Creator   string    `json:"creator"`
	CreatedAt time.Time `json:"created_at"`
	Items     []Item    `json:"items"`
}
type Action struct {
	ID      string `json:"id"`
	Version int64  `json:"version"`
}
