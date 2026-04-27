import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { submitPodscriberServerFn } from "../server/podscriber";
import type { PodcastTranscribeResponse } from "../lib/podscriber/types";

export const Route = createFileRoute("/admin/podscriber")({
  head: () => ({
    meta: [{ title: "Podscriber" }],
  }),
  component: PodscriberAdminPage,
});

type SubmitState = "idle" | "submitting" | "success" | "error";

export function PodscriberAdminPage() {
  const payloadId = useId();
  const [payload, setPayload] = useState("");
  const [response, setResponse] = useState<PodcastTranscribeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (text: string) => submitPodscriberServerFn({ data: { text } }),
    onMutate: () => {
      setErrorMessage(null);
      setResponse(null);
    },
    onSuccess: (result) => {
      setResponse(result);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not submit the payload.");
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPayload = payload.trim();
    if (!trimmedPayload) {
      setErrorMessage("Paste the Podcast Addict payload before submitting.");
      setResponse(null);
      return;
    }

    mutation.mutate(trimmedPayload);
  }

  const submitState: SubmitState = mutation.isPending
    ? "submitting"
    : response
      ? "success"
      : errorMessage
        ? "error"
        : "idle";
  const isSuccess = submitState === "success";
  const isSubmitting = submitState === "submitting";
  const isDisabled = isSubmitting || isSuccess;
  const submitLabel = isSubmitting
    ? "Submitting..."
    : isSuccess
      ? "Submitted"
      : "Start Transcription";

  return (
    <section box-="square" className="admin-page admin-podscriber-page">
      <div className="admin-copy" is-="typography-block">
        <span cap-="square round" is-="badge" variant-="foreground1">
          Podscriber
        </span>
        <h2>Turn a shared podcast episode into a transcription job.</h2>
        <p>
          Paste the full Podcast Addict share payload below. The Nitro app invokes the backend
          Lambda directly with the text payload.
        </p>
      </div>

      <form className="admin-podscriber-form" onSubmit={handleSubmit}>
        <label className="admin-podscriber-label" htmlFor={payloadId}>
          PodcastAddict Payload
        </label>
        <textarea
          className="admin-podscriber-textarea"
          disabled={isDisabled}
          id={payloadId}
          onChange={(event) => setPayload(event.target.value)}
          placeholder="Paste the Podcast Addict share text here..."
          rows={12}
          spellCheck={false}
          value={payload}
        />
        <div className="admin-podscriber-actions">
          <button
            box-="round"
            className={`admin-podscriber-submit is-${submitState}`}
            disabled={isDisabled}
            type="submit"
            variant-="foreground0"
          >
            {submitLabel}
          </button>
        </div>
      </form>

      {errorMessage ? (
        <section aria-live="polite" box-="round" className="admin-podscriber-error">
          <span cap-="square round" is-="badge" variant-="background1">
            Request Error
          </span>
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {response ? (
        <section aria-live="polite" box-="round" className="admin-podscriber-response">
          <div className="admin-podscriber-response-header">
            <div className="admin-copy" is-="typography-block">
              <span cap-="square round" is-="badge" variant-="background1">
                Accepted
              </span>
              <h3>Transcription request queued</h3>
            </div>
            <code>{response.transcription_lambda_id}</code>
          </div>
          <pre>
            <code>{JSON.stringify(response, null, 2)}</code>
          </pre>
        </section>
      ) : null}
    </section>
  );
}
