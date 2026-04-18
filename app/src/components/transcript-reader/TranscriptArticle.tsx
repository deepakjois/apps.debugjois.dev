import {
  formatTranscriptDate,
  getTranscriptParagraphs,
  getTranscriptTitle,
} from "../../queries/queries";
import type { TranscriptPayload } from "../../queries/queries";

type TranscriptArticleProps = {
  transcript: TranscriptPayload;
};

export default function TranscriptArticle({ transcript }: TranscriptArticleProps) {
  const podcastName = transcript.podcast?.podcast?.title;
  const episode = transcript.podcast?.episode;
  const formattedDate = formatTranscriptDate(episode?.published_date);
  const descriptionHtml = episode?.description_html;
  const episodeUrl = transcript.podcast?.source?.episode_url;
  const title = getTranscriptTitle(transcript);
  const paragraphs = getTranscriptParagraphs(transcript);
  let lastSpeaker: string | number | null = null;

  return (
    <>
      <div className="episode-header">
        {podcastName ? <div className="podcast-name">{podcastName}</div> : null}

        <h1 className="episode-title">{title}</h1>

        <div className="episode-meta">
          {formattedDate ? <span>{formattedDate}</span> : null}
          {episode?.duration ? <span>{episode.duration}</span> : null}
        </div>

        {descriptionHtml ? (
          <details className="episode-desc-details">
            <summary className="episode-desc-summary">Show notes</summary>
            <div className="episode-desc" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
          </details>
        ) : null}

        {episodeUrl ? (
          <a className="episode-link" href={episodeUrl} target="_blank" rel="noreferrer">
            Listen to episode ↗
          </a>
        ) : null}
      </div>

      <div className="transcript">
        <div className="transcript-heading">Transcript</div>

        {paragraphs.map((paragraph, index) => {
          const speaker = paragraph.speaker ?? 0;
          const text = (paragraph.sentences ?? [])
            .map((sentence) => sentence.text ?? "")
            .join(" ")
            .trim();

          if (!text) {
            return null;
          }

          const shouldShowSpeaker = speaker !== lastSpeaker;
          lastSpeaker = speaker;

          return (
            <div className="transcript-paragraph" key={`${speaker}-${index}-${text.slice(0, 32)}`}>
              {shouldShowSpeaker ? (
                <div className="transcript-speaker">Speaker {String(speaker)}</div>
              ) : null}
              <p>{text}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
