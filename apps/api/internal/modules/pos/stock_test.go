package pos

import (
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/recipe"
	"testing"
)

func TestRecipeStockDeltas(t *testing.T) {
	snapshot := &recipe.Snapshot{Ingredients: []recipe.Ingredient{{IngredientInput: recipe.IngredientInput{ProductID: "milk", BaseUnit: "l", Quantity: "0.125"}}}}
	one := "1"
	old := []Line{{LineInput: LineInput{Quantity: 2}, Recipe: snapshot}}
	lines := []Line{{LineInput: LineInput{Quantity: 3}, Recipe: snapshot}, {LineInput: LineInput{ProductID: "milk", Quantity: 1}, StockTracked: true, StockRatio: &one, StockBase: "l"}}
	delta, _, err := stockDeltas(old, lines)
	if err != nil || delta["milk"].FloatString(6) != "-1.125000" {
		t.Fatal(delta, err)
	}
	delta, _, err = stockDeltas(lines, old)
	if err != nil || delta["milk"].FloatString(6) != "1.125000" {
		t.Fatal(delta, err)
	}
}

func TestStockDeltas(t *testing.T) {
	ratio := "24"
	fraction := "0.125"
	base := "1"
	lines := []Line{{LineInput: LineInput{ProductID: "beer", Quantity: 2}, StockTracked: true, StockRatio: &ratio, StockBase: "Lon"}, {LineInput: LineInput{ProductID: "beer", Quantity: 1}, StockTracked: true, StockRatio: &base, StockBase: "Lon"}, {LineInput: LineInput{ProductID: "weight", Quantity: 3}, StockTracked: true, StockRatio: &fraction, StockBase: "kg"}}
	deltas, _, err := stockDeltas(nil, lines)
	if err != nil || deltas["beer"].FloatString(6) != "-49.000000" || deltas["weight"].FloatString(6) != "-0.375000" {
		t.Fatalf("wrong conversion %v %v", deltas, err)
	}
	delta, _, err := stockDeltas(lines, lines[:1])
	if err != nil || delta["beer"].FloatString(6) != "1.000000" {
		t.Fatal("refund delta incorrect")
	}
	if _, _, err = stockDeltas(nil, []Line{{StockTracked: true}}); err == nil {
		t.Fatal("missing snapshot accepted")
	}
}
