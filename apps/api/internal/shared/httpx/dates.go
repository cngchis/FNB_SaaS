package httpx

import (
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

func BusinessDateRange(from, to string) (pgtype.Timestamptz, pgtype.Timestamptz, error) {
	var start, until pgtype.Timestamptz
	zone := time.FixedZone("Asia/Ho_Chi_Minh", 7*60*60)
	if from != "" {
		value, err := time.ParseInLocation("2006-01-02", from, zone)
		if err != nil {
			return start, until, Invalid("Use YYYY-MM-DD dates.")
		}
		start = pgtype.Timestamptz{Time: value, Valid: true}
	}
	if to != "" {
		value, err := time.ParseInLocation("2006-01-02", to, zone)
		if err != nil {
			return start, until, Invalid("Use YYYY-MM-DD dates.")
		}
		until = pgtype.Timestamptz{Time: value.AddDate(0, 0, 1), Valid: true}
	}
	if start.Valid && until.Valid && !start.Time.Before(until.Time) {
		return start, until, Invalid("The start date must not exceed the end date.")
	}
	return start, until, nil
}
