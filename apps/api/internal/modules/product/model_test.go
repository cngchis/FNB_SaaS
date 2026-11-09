package product

import (
	"github.com/gin-gonic/gin/binding"
	"testing"
)

func money(n int64) *int64 { return &n }
func flag(b bool) *bool    { return &b }
func TestProductValidation(t *testing.T) {
	cases := []struct {
		name   string
		change func(*Input)
		valid  bool
	}{
		{"zero selling price", func(in *Input) { in.PriceVND = money(0) }, true},
		{"prepared without manual cost", func(in *Input) { in.ProductType = "prepared" }, true},
		{"prepared manual cost rejected", func(in *Input) { in.ProductType = "prepared"; in.CostVND = money(0) }, false},
		{"prepared stock rejected", func(in *Input) { in.ProductType = "prepared"; in.TracksStock = flag(true) }, false},
		{"duplicate attribute option rejected", func(in *Input) {
			in.Attributes = []AttributeInput{{Name: "Size", Value: "M"}, {Name: "size ", Value: "m"}}
		}, false},
		{"multiple sizes accepted", func(in *Input) {
			in.Attributes = []AttributeInput{{Name: "Size", Value: "M"}, {Name: "Size", Value: "L", PriceDeltaVND: 5000}}
		}, true},
		{"negative option price rejected", func(in *Input) { in.Attributes = []AttributeInput{{Name: "Size", Value: "S", PriceDeltaVND: -40000}} }, false},
		{"duplicate base unit rejected", func(in *Input) { in.Units = []UnitInput{{Name: "cái", Ratio: "24", PriceVND: money(50000)}} }, false},
		{"zero ratio rejected", func(in *Input) { in.Units = []UnitInput{{Name: "Thùng", Ratio: "0.000", PriceVND: money(50000)}} }, false},
		{"decimal ratio accepted", func(in *Input) { in.Units = []UnitInput{{Name: "Nửa", Ratio: "0.5", PriceVND: money(15000)}} }, true},
		{"ratio precision rejected", func(in *Input) { in.Units = []UnitInput{{Name: "Thùng", Ratio: "1.0001", PriceVND: money(50000)}} }, false},
		{"negative money rejected", func(in *Input) { in.PriceVND = money(-1) }, false},
		{"prepared unit cost rejected", func(in *Input) {
			in.ProductType = "prepared"
			in.Units = []UnitInput{{Name: "Thùng", Ratio: "24", PriceVND: money(50000), CostVND: money(10)}}
		}, false},
		{"image script rejected", func(in *Input) { s := "javascript:alert(1)"; in.ImageURL = &s }, false},
		{"external asset accepted", func(in *Input) { s := "https://assets.example.test/item.webp"; in.ImageURL = &s }, true},
		{"local asset accepted", func(in *Input) { s := "/default-product.svg"; in.ImageURL = &s }, true},
		{"blank name rejected", func(in *Input) { in.Name = "   " }, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := Input{Name: "Món", ProductType: "goods", PriceVND: money(35000)}
			tc.change(&in)
			err := binding.Validator.ValidateStruct(in)
			if err == nil {
				err = in.Normalize()
			}
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v, want %v; error=%v", err == nil, tc.valid, err)
			}
		})
	}
}
