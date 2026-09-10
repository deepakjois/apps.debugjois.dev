// Package youtube downloads YouTube audio and extracts a curated metadata set
// by invoking yt-dlp.
package youtube

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber"
)

// Config locates yt-dlp and its caller-owned download directory.
type Config struct {
	Executable string
	OutputDir  string
}

type commandRunner interface {
	Run(ctx context.Context, name string, args ...string) (stdout, stderr []byte, err error)
}

type execRunner struct{}

func (execRunner) Run(ctx context.Context, name string, args ...string) ([]byte, []byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.Bytes(), stderr.Bytes(), err
}

// Extractor uses a configured yt-dlp process and output directory. Callers own
// the directory and are responsible for removing downloaded files.
type Extractor struct {
	executable string
	outputDir  string
	runner     commandRunner
}

func New(config Config) (*Extractor, error) {
	executable := strings.TrimSpace(config.Executable)
	if executable == "" {
		executable = "yt-dlp"
	}
	config.Executable = executable
	return newExtractor(config, execRunner{})
}

func newExtractor(config Config, runner commandRunner) (*Extractor, error) {
	if runner == nil {
		return nil, errors.New("configure YouTube extractor: command runner is nil")
	}
	outputDir := strings.TrimSpace(config.OutputDir)
	if outputDir == "" {
		return nil, errors.New("configure YouTube extractor: output directory is empty")
	}
	absDir, err := filepath.Abs(outputDir)
	if err != nil {
		return nil, fmt.Errorf("configure YouTube extractor: resolve output directory: %w", err)
	}
	info, err := os.Stat(absDir)
	if err != nil {
		return nil, fmt.Errorf("configure YouTube extractor: stat output directory: %w", err)
	}
	if !info.IsDir() {
		return nil, errors.New("configure YouTube extractor: output path is not a directory")
	}
	return &Extractor{
		executable: config.Executable,
		outputDir:  absDir,
		runner:     runner,
	}, nil
}

func (e *Extractor) CanHandle(input string) bool {
	u, err := url.Parse(strings.TrimSpace(input))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	switch strings.ToLower(u.Hostname()) {
	case "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be":
		return true
	default:
		return false
	}
}

// ytMetadata contains the curated subset of yt-dlp's JSON output used downstream.
type ytMetadata struct {
	ID                 string  `json:"id"`
	Title              string  `json:"title"`
	Description        string  `json:"description"`
	WebpageURL         string  `json:"webpage_url"`
	OriginalURL        string  `json:"original_url"`
	UploadDate         string  `json:"upload_date"`
	Duration           float64 `json:"duration"`
	Channel            string  `json:"channel"`
	ChannelURL         string  `json:"channel_url"`
	Uploader           string  `json:"uploader"`
	UploaderURL        string  `json:"uploader_url"`
	Thumbnail          string  `json:"thumbnail"`
	Filename           string  `json:"_filename"`
	RequestedDownloads []struct {
		Filepath string `json:"filepath"`
	} `json:"requested_downloads"`
}

func (e *Extractor) Extract(ctx context.Context, input string) (result podscriber.TranscriptionInput, retErr error) {
	if err := ctx.Err(); err != nil {
		return podscriber.TranscriptionInput{}, err
	}
	if e == nil || e.runner == nil || strings.TrimSpace(e.executable) == "" || strings.TrimSpace(e.outputDir) == "" {
		return podscriber.TranscriptionInput{}, errors.New("extract YouTube media: YouTube extractor is not configured")
	}
	input = strings.TrimSpace(input)
	if !e.CanHandle(input) {
		return podscriber.TranscriptionInput{}, errors.New("extract YouTube media: expected a YouTube HTTP(S) URL")
	}
	downloadDir, err := os.MkdirTemp(e.outputDir, "podscriber-youtube-*")
	if err != nil {
		return podscriber.TranscriptionInput{}, fmt.Errorf("extract YouTube media: create download directory: %w", err)
	}
	keepDownload := false
	defer func() {
		if keepDownload {
			return
		}
		if err := os.RemoveAll(downloadDir); err != nil {
			cleanupErr := fmt.Errorf("extract YouTube media: remove failed download: %w", err)
			if retErr == nil {
				retErr = cleanupErr
				return
			}
			retErr = errors.Join(retErr, cleanupErr)
		}
	}()

	args := []string{
		"--no-playlist",
		"--no-simulate",
		"--no-progress",
		"--dump-single-json",
		"--format", "bestaudio",
		"--paths", downloadDir,
		"--output", "%(id)s.%(ext)s",
		input,
	}
	stdout, stderr, err := e.runner.Run(ctx, e.executable, args...)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return podscriber.TranscriptionInput{}, ctxErr
		}
		message := strings.TrimSpace(string(stderr))
		if message == "" {
			return podscriber.TranscriptionInput{}, fmt.Errorf("extract YouTube media: %w", err)
		}
		return podscriber.TranscriptionInput{}, fmt.Errorf("extract YouTube media: %s: %w", message, err)
	}

	var metadata ytMetadata
	if err := json.Unmarshal(bytes.TrimSpace(stdout), &metadata); err != nil {
		return podscriber.TranscriptionInput{}, fmt.Errorf("extract YouTube media: decode yt-dlp metadata: %w", err)
	}
	mediaPath := downloadedPath(metadata)
	if mediaPath == "" {
		return podscriber.TranscriptionInput{}, errors.New("extract YouTube media: yt-dlp did not report a downloaded file")
	}
	if !filepath.IsAbs(mediaPath) {
		mediaPath = filepath.Join(downloadDir, mediaPath)
	}
	mediaPath = filepath.Clean(mediaPath)
	fileInfo, err := os.Stat(mediaPath)
	if err != nil {
		return podscriber.TranscriptionInput{}, fmt.Errorf("extract YouTube media: stat downloaded audio: %w", err)
	}
	if !fileInfo.Mode().IsRegular() {
		return podscriber.TranscriptionInput{}, errors.New("extract YouTube media: downloaded audio is not a regular file")
	}

	canonical := canonicalURL(input, metadata)
	result = podscriber.TranscriptionInput{
		SchemaVersion: podscriber.SchemaVersion,
		Source: podscriber.Source{
			Type:  podscriber.SourceTypeYouTube,
			Input: input,
			URL:   canonical,
		},
		Media: podscriber.Media{Type: podscriber.MediaTypeLocalFile, Path: mediaPath},
		Metadata: podscriber.Metadata{
			Title:           metadata.Title,
			Description:     metadata.Description,
			PublishedDate:   publishedDate(metadata.UploadDate),
			DurationSeconds: metadata.Duration,
			Series:          series(metadata),
			Extra:           extras(metadata),
		},
	}
	if err := result.Validate(); err != nil {
		return podscriber.TranscriptionInput{}, fmt.Errorf("extract YouTube media: invalid yt-dlp metadata: %w", err)
	}
	keepDownload = true
	return result, nil
}

func downloadedPath(metadata ytMetadata) string {
	for _, download := range metadata.RequestedDownloads {
		if strings.TrimSpace(download.Filepath) != "" {
			return download.Filepath
		}
	}
	return metadata.Filename
}

func canonicalURL(input string, metadata ytMetadata) string {
	for _, candidate := range []string{metadata.WebpageURL, metadata.OriginalURL, input} {
		u, err := url.Parse(strings.TrimSpace(candidate))
		if err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" {
			u.Fragment = ""
			return u.String()
		}
	}
	return input
}

func publishedDate(value string) string {
	parsed, err := time.Parse("20060102", value)
	if err != nil {
		return ""
	}
	return parsed.Format(time.DateOnly)
}

func series(metadata ytMetadata) *podscriber.Series {
	title := metadata.Channel
	if title == "" {
		title = metadata.Uploader
	}
	seriesURL := metadata.ChannelURL
	if seriesURL == "" {
		seriesURL = metadata.UploaderURL
	}
	if title == "" && seriesURL == "" {
		return nil
	}
	return &podscriber.Series{Title: title, URL: seriesURL}
}

func extras(metadata ytMetadata) map[string]any {
	values := map[string]string{
		"video_id":      metadata.ID,
		"channel_title": metadata.Channel,
		"channel_url":   metadata.ChannelURL,
		"uploader":      metadata.Uploader,
		"uploader_url":  metadata.UploaderURL,
		"thumbnail_url": metadata.Thumbnail,
	}
	result := make(map[string]any)
	for key, value := range values {
		if strings.TrimSpace(value) != "" {
			result[key] = value
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}
