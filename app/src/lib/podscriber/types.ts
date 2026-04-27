// PodcastSource describes the frontend text and parsed Podcast Addict episode URL.
export type PodcastSource = {
  input?: string;
  share_title?: string;
  episode_url?: string;
};

// PodcastMetadata holds parsed podcast-level fields from Podcast Addict.
export type PodcastMetadata = {
  title?: string;
  url?: string;
};

// PodcastEpisodeMetadata holds parsed episode fields used by the transcriber.
export type PodcastEpisodeMetadata = {
  title?: string;
  published_at?: string;
  published_date?: string;
  duration?: string;
  audio_url?: string;
  description_html?: string;
};

// PodcastTranscribeResponse is the accepted response returned by the backend Lambda.
export type PodcastTranscribeResponse = {
  podcast: {
    source?: PodcastSource;
    podcast?: PodcastMetadata;
    episode?: PodcastEpisodeMetadata;
  };
  transcription_lambda_id: string;
};
