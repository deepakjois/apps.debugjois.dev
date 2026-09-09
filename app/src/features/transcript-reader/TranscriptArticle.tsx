import { formatTranscriptDate, getTranscriptDisplayParagraphs, getTranscriptTitle } from "./data";
import type { TranscriptPayload } from "./data";

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
  const paragraphs = getTranscriptDisplayParagraphs(transcript);

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

        {paragraphs.map((paragraph) => (
          <div className="transcript-paragraph" key={paragraph.key}>
            {paragraph.showSpeaker ? (
              <div className="transcript-speaker">Speaker {String(paragraph.speaker)}</div>
            ) : null}
            <p>{paragraph.text}</p>
          </div>
        ))}
      </div>
    </>
  );
}
