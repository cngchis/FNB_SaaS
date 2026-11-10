package invoice

import (
	"testing"
	"time"
)

func TestBusinessDateRange(t *testing.T) {
	start, until, err := dateRange("2026-11-10", "2026-11-10")
	if err != nil {
		t.Fatal(err)
	}
	if start.Time.UTC().Format(time.RFC3339) != "2026-11-09T17:00:00Z" || until.Time.UTC().Format(time.RFC3339) != "2026-11-10T17:00:00Z" {
		t.Fatal("incorrect local-day boundaries")
	}
	if until.Time.Sub(start.Time) != 24*time.Hour {
		t.Fatal("end date must include the entire day")
	}
	for _, dates := range [][2]string{{"2026-11-11", "2026-11-10"}, {"bad", ""}, {"", "2026-02-30"}, {"2026-1-1", ""}} {
		if _, _, err := dateRange(dates[0], dates[1]); err == nil {
			t.Fatalf("accepted invalid range %v", dates)
		}
	}
	start, until, err = dateRange("", "")
	if err != nil || start.Valid || until.Valid {
		t.Fatal("empty dates must leave the range unbounded")
	}
}
