package pos

import "testing"

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
