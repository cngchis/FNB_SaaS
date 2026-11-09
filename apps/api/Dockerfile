FROM golang:1.23-alpine AS build

RUN apk add --no-cache ca-certificates git
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN mkdir -p /out \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/bootstrap ./cmd/bootstrap \
    && GOBIN=/out go install github.com/pressly/goose/v3/cmd/goose@v3.24.1

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/api /app/api
COPY --from=build /out/bootstrap /app/bootstrap
COPY --from=build /out/goose /goose
COPY migrations /app/migrations
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/app/api"]
