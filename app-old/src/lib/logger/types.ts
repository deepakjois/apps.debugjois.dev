// DailyLogNote is the decoded editor document used by the logger UI.
export type DailyLogNote = {
  title: string;
  contents: string;
};

// DailyLogLambdaResponse is the backend Lambda wire shape with base64 contents.
export type DailyLogLambdaResponse = {
  title: string;
  contents: string;
};
