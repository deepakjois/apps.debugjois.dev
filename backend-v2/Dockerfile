FROM golang:1.26.8-alpine AS builder

WORKDIR /src

RUN apk add --no-cache ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /daily-log ./cmd/daily-log && \
    go build -trimpath -ldflags="-s -w" -o /podscriber ./cmd/podscriber

FROM alpine:3.23

RUN apk add --no-cache ca-certificates ffmpeg tzdata yt-dlp

COPY --from=builder /daily-log /daily-log
COPY --from=builder /podscriber /podscriber
COPY gcp-credentials.json /gcp-credentials.json

USER 65532:65532

ENTRYPOINT ["/daily-log"]
