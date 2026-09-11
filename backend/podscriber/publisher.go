package podscriber

import "context"

// Publisher persists completed transcription results for downstream readers.
type Publisher interface {
	Publish(context.Context, TranscriptionResult) error
}
