package pos

import "testing"

func TestIntegerMoneyBoundaries(t *testing.T) {
	for _, input := range []struct {
		price, quantity int64
		valid           bool
	}{{0, 1, true}, {35000, 2, true}, {maxMoney, 1, true}, {maxMoney, 2, false}, {1, 0, false}, {-1, 1, false}, {1, 10001, false}} {
		_, err := lineAmount(input.price, input.quantity)
		if (err == nil) != input.valid {
			t.Errorf("price=%d quantity=%d error=%v", input.price, input.quantity, err)
		}
	}
}
