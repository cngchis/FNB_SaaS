package report

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestSafeNumbers(t *testing.T) {
	for _, test := range []struct {
		payload string
		safe    bool
	}{
		{`{"cost":12000.000,"profit":-1000,"missing":null}`, true},
		{`[9007199254740991,-9007199254740991,0]`, true},
		{`9007199254740992`, false},
		{`-9007199254740992`, false},
		{`9007199254740990.5`, false},
		{`0.001`, false},
	} {
		t.Run(test.payload, func(t *testing.T) {
			decoder := json.NewDecoder(bytes.NewBufferString(test.payload))
			decoder.UseNumber()
			var value any
			if err := decoder.Decode(&value); err != nil {
				t.Fatal(err)
			}
			normalized, safe := normalizeNumbers(value)
			if safe != test.safe {
				t.Fatalf("safety mismatch for %s", test.payload)
			}
			if safe {
				if _, err := json.Marshal(normalized); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

func TestNormalizedIntegerJSON(t *testing.T) {
	result, ok := normalizeNumbers(map[string]any{"cost": json.Number("12000.000")})
	if !ok {
		t.Fatal("integer SQL numeric was rejected")
	}
	data, err := json.Marshal(result)
	if err != nil || string(data) != "{\"cost\":12000}" {
		t.Fatalf("integer wire format: %s, %v", data, err)
	}
}
