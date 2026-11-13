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
