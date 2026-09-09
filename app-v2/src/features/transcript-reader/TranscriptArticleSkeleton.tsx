type TranscriptArticleSkeletonProps = {
  dense?: boolean;
};

export default function TranscriptArticleSkeleton({
  dense = false,
}: TranscriptArticleSkeletonProps) {
  return (
    <div aria-hidden="true" className={`article-skeleton${dense ? " article-skeleton-dense" : ""}`}>
      <div className="episode-header episode-header-skeleton">
        <div className="skeleton-line skeleton-line-kicker" />
        <div className="skeleton-line skeleton-line-title skeleton-line-title-wide" />
        <div className="skeleton-line skeleton-line-title" />
        <div className="skeleton-meta-row">
          <div className="skeleton-line skeleton-line-meta" />
          <div className="skeleton-line skeleton-line-meta skeleton-line-meta-short" />
          <div className="skeleton-line skeleton-line-meta" />
        </div>
        <div className="skeleton-line skeleton-line-summary" />
      </div>

      <div className="transcript transcript-skeleton">
        <div className="transcript-heading">Transcript</div>

        <div className="transcript-paragraph transcript-paragraph-skeleton">
          <div className="skeleton-line skeleton-line-speaker" />
          <div className="skeleton-block">
            <div className="skeleton-line skeleton-line-body" />
            <div className="skeleton-line skeleton-line-body skeleton-line-body-wide" />
            <div className="skeleton-line skeleton-line-body skeleton-line-body-mid" />
          </div>
        </div>

        <div className="transcript-paragraph transcript-paragraph-skeleton">
          <div className="skeleton-line skeleton-line-speaker" />
          <div className="skeleton-block">
            <div className="skeleton-line skeleton-line-body skeleton-line-body-wide" />
            <div className="skeleton-line skeleton-line-body" />
            <div className="skeleton-line skeleton-line-body skeleton-line-body-short" />
          </div>
        </div>

        {dense ? null : (
          <div className="transcript-paragraph transcript-paragraph-skeleton">
            <div className="skeleton-line skeleton-line-speaker" />
            <div className="skeleton-block">
              <div className="skeleton-line skeleton-line-body" />
              <div className="skeleton-line skeleton-line-body skeleton-line-body-mid" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
