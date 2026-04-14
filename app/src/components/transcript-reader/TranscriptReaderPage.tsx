import TranscriptArticle from "./TranscriptArticle";
import TranscriptSearchModal from "./TranscriptSearchModal";
import type { TranscriptIndexItem, TranscriptPayload } from "../../queries/queries";

type TranscriptReaderPageProps = {
  transcriptList: TranscriptIndexItem[];
  transcript: TranscriptPayload | null;
  selectedLocation: string | null;
};

export default function TranscriptReaderPage({
  transcriptList,
  transcript,
  selectedLocation,
}: TranscriptReaderPageProps) {
  return (
    <div className="transcript-reader-page">
      <TranscriptSearchModal
        currentTranscriptLocation={selectedLocation}
        transcriptList={transcriptList}
      />

      <main className="content">
        {transcript ? (
          <TranscriptArticle transcript={transcript} />
        ) : (
          <p className="status">No transcripts available yet.</p>
        )}
      </main>
    </div>
  );
}
