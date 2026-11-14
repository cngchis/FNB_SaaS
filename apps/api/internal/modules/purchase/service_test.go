package purchase

import "testing"

func TestValidateItems(t *testing.T) {
	for _, test := range []struct {
		items []ItemInput
		valid bool
	}{
		{[]ItemInput{{ProductID: "a", Quantity: 2, Cost: 10}}, true},
		{[]ItemInput{{ProductID: "a", Quantity: 2, Cost: maxMoney}}, false},
		{[]ItemInput{{ProductID: "a", Quantity: 1, Cost: maxMoney}, {ProductID: "b", Quantity: 1, Cost: 1}}, false},
		{[]ItemInput{{ProductID: "a", Quantity: 1, Cost: 1}, {ProductID: "a", Quantity: 1, Cost: 1}}, false},
		{[]ItemInput{{ProductID: "a", Quantity: 0, Cost: 1}}, false},
	} {
		if (validateItems(test.items) == nil) != test.valid {
			t.Fatalf("validation mismatch: %+v", test)
		}
	}
}

func TestUnitArithmetic(t *testing.T) {
	for _, test := range []struct {
		quantity    int64
		ratio, want string
	}{{2, "24", "48.000000"}, {3, "0.125", "0.375000"}, {1000000000, "999999999.999", "999999999999000000.000000"}} {
		got, err := baseQuantity(test.quantity, test.ratio)
		if err != nil || got != test.want {
			t.Fatalf("quantity=%s err=%v", got, err)
		}
	}
	if baseCost(500000, "24") != nil {
		t.Fatal("fractional VND cost was rounded")
	}
	if cost := baseCost(300000, "24"); cost == nil || *cost != 12500 {
		t.Fatal("exact base cost missing")
	}
	if !sameRatio("24", "24.000") || sameRatio("0", "0") || sameRatio("1e3", "1000") {
		t.Fatal("ratio comparison failed")
	}
}
