package recipe

import "testing"

func TestQuantityAndSelection(t *testing.T) {
	for _, q := range []string{"0.000001", "1", "1000000000.000000"} {
		if !ValidQuantity(q) {
			t.Fatal(q)
		}
	}
	for _, q := range []string{"0", "-1", "NaN", "1e3", "0.0000001", "1000000000.000001"} {
		if ValidQuantity(q) {
			t.Fatal(q)
		}
	}
	a := []Attribute{{Name: "Size", Value: "L"}, {Name: "Ice", Value: "Less"}}
	b := []Attribute{a[1], a[0]}
	if SelectionKey("Ly", a) != SelectionKey("Ly", b) || SelectionKey("Ly", a) == SelectionKey("Ly", nil) {
		t.Fatal("unstable selector")
	}
	in := Input{Unit: "Ly", Ingredients: []IngredientInput{{ProductID: "a", Quantity: "0.25", BaseUnit: "kg"}, {ProductID: "a", Quantity: "1", BaseUnit: "kg"}}}
	if in.Normalize() == nil {
		t.Fatal("duplicate ingredients accepted")
	}
}
func TestExactRecipeCost(t *testing.T) {
	cost := int64(10000)
	s := &Snapshot{Ingredients: []Ingredient{{IngredientInput: IngredientInput{Quantity: "0.125"}, Cost: &cost}}}
	if got := UnitCost(s); got == nil || *got != 1250 {
		t.Fatal(got)
	}
	s.Ingredients[0].Quantity = "0.000001"
	if UnitCost(s) != nil {
		t.Fatal("fractional VND rounded")
	}
	s.Ingredients[0].Cost = nil
	if UnitCost(s) != nil {
		t.Fatal("unknown cost treated as zero")
	}
}
