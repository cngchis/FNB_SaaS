package pos

import (
	"time"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
)

const maxMoney int64 = 9007199254740991

type Attribute struct {
	Name  string `json:"name" binding:"required,max=120"`
	Value string `json:"value" binding:"required,max=120"`
}
type LineInput struct {
	ProductID  string      `json:"product_id" binding:"required,uuid"`
	Quantity   int64       `json:"quantity" binding:"min=1,max=10000"`
	Unit       string      `json:"unit" binding:"max=80"`
	Attributes []Attribute `json:"attributes" binding:"max=20,dive"`
}
type Input struct {
	RoomID     *string     `json:"room_id" binding:"omitempty,uuid"`
	CustomerID *string     `json:"customer_id" binding:"omitempty,uuid"`
	Note       string      `json:"note" binding:"max=4000"`
	Discount   int64       `json:"discount_vnd" binding:"min=0,max=9007199254740991"`
	Version    int64       `json:"version" binding:"min=0"`
	Items      []LineInput `json:"items" binding:"required,min=1,max=200,dive"`
}
type Line struct {
	StockTracked bool    `json:"stock_tracked"`
	StockRatio   *string `json:"stock_ratio"`
	StockBase    string  `json:"stock_base_unit"`
	Cost         *int64  `json:"cost_vnd"`
	LineInput
	Key    string `json:"key"`
	Name   string `json:"name"`
	SKU    string `json:"sku"`
	Price  int64  `json:"price_vnd"`
	Amount int64  `json:"amount_vnd"`
}
type Order struct {
	ID         string    `json:"id"`
	Code       string    `json:"code"`
	RoomID     *string   `json:"room_id"`
	Room       string    `json:"room"`
	CustomerID *string   `json:"customer_id"`
	Customer   string    `json:"customer"`
	Note       string    `json:"note"`
	Status     string    `json:"status"`
	Version    int64     `json:"version"`
	Subtotal   int64     `json:"subtotal_vnd"`
	Discount   int64     `json:"discount_vnd"`
	Total      int64     `json:"total_vnd"`
	Paid       int64     `json:"paid_vnd"`
	Invoice    *string   `json:"invoice_code"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	Items      []Line    `json:"items"`
}
type Payment struct {
	Order    Order `json:"order"`
	Received int64 `json:"received_vnd"`
	Applied  int64 `json:"applied_vnd"`
	Change   int64 `json:"change_vnd"`
}

func conflict(message string) error {
	return &httpx.PublicError{Status: 409, Code: "state_conflict", Message: message}
}
func lineAmount(price, quantity int64) (int64, error) {
	if price < 0 || quantity < 1 || quantity > 10000 || price > maxMoney/quantity {
		return 0, httpx.Invalid("Invalid quantity or money overflow.")
	}
	return price * quantity, nil
}
