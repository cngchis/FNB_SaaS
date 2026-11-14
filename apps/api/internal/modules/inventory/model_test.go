package inventory

import "testing"

func TestValidQuantity(t *testing.T) {
	for _, s := range []string{"0", "1.000001", "1000000000", "0.125"} {
		if !ValidQuantity(s) {
			t.Fatal(s)
		}
	}
	for _, s := range []string{"-1", "1e3", "0.0000001", "1000000000.000001", "NaN", "01", ""} {
		if ValidQuantity(s) {
			t.Fatal(s)
		}
	}
}
