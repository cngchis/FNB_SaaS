package recipe

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"regexp"
	"sort"
	"strings"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
)

type Attribute struct {
	Name  string `json:"name" binding:"required,max=120"`
	Value string `json:"value" binding:"required,max=120"`
}
type IngredientInput struct {
	ProductID string `json:"product_id" binding:"required,uuid"`
	Quantity  string `json:"quantity" binding:"required,max=32"`
	BaseUnit  string `json:"base_unit" binding:"required,max=80"`
}
type Input struct {
	Unit        string            `json:"unit" binding:"required,max=80"`
	Attributes  []Attribute       `json:"attributes" binding:"max=20,dive"`
	Ingredients []IngredientInput `json:"ingredients" binding:"required,min=1,max=100,dive"`
	Version     int64             `json:"version" binding:"min=0"`
}
type Ingredient struct {
	IngredientInput
	Name string `json:"name"`
	SKU  string `json:"sku"`
	Cost *int64 `json:"cost_vnd"`
}
type Snapshot struct {
	ID          string       `json:"id"`
	Version     int64        `json:"version"`
	Ingredients []Ingredient `json:"ingredients"`
}
type Recipe struct {
	Snapshot
	Unit       string      `json:"unit"`
	Attributes []Attribute `json:"attributes"`
}

var quantityPattern = regexp.MustCompile(`^(0|[1-9][0-9]{0,9})(\.[0-9]{1,6})?$`)

func ValidQuantity(value string) bool {
	if !quantityPattern.MatchString(value) {
		return false
	}
	q, ok := new(big.Rat).SetString(value)
	return ok && q.Sign() > 0 && q.Cmp(new(big.Rat).SetInt64(1000000000)) <= 0
}
func SelectionKey(unit string, attrs []Attribute) string {
	ordered := append([]Attribute{}, attrs...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Name < ordered[j].Name })
	data, _ := json.Marshal(struct {
		Unit       string
		Attributes []Attribute
	}{unit, ordered})
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
func (in *Input) Normalize() error {
	in.Unit = strings.TrimSpace(in.Unit)
	if in.Unit == "" || len(in.Ingredients) == 0 {
		return httpx.Invalid("A recipe requires a unit and ingredients.")
	}
	seen := map[string]bool{}
	for _, a := range in.Attributes {
		if strings.TrimSpace(a.Name) == "" || strings.TrimSpace(a.Value) == "" || seen[a.Name] {
			return httpx.Invalid("Choose one value per recipe attribute.")
		}
		seen[a.Name] = true
	}
	seen = map[string]bool{}
	for _, l := range in.Ingredients {
		if !ValidQuantity(l.Quantity) || seen[l.ProductID] {
			return httpx.Invalid("Use positive ingredient quantities with at most six decimal places and merge duplicate ingredients.")
		}
		seen[l.ProductID] = true
	}
	if in.Attributes == nil {
		in.Attributes = []Attribute{}
	}
	sort.Slice(in.Attributes, func(i, j int) bool { return in.Attributes[i].Name < in.Attributes[j].Name })
	return nil
}

// Costs stay integer VND. Unknown or fractional totals remain unknown, never rounded.
func UnitCost(s *Snapshot) *int64 {
	if s == nil {
		return nil
	}
	total := new(big.Rat)
	for _, l := range s.Ingredients {
		if l.Cost == nil {
			return nil
		}
		q, ok := new(big.Rat).SetString(l.Quantity)
		if !ok {
			return nil
		}
		total.Add(total, q.Mul(q, new(big.Rat).SetInt64(*l.Cost)))
	}
	if !total.IsInt() || !total.Num().IsInt64() {
		return nil
	}
	n := total.Num().Int64()
	if n < 0 || n > 9007199254740991 {
		return nil
	}
	return &n
}
