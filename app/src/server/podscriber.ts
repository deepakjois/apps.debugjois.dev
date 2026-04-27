import { createServerFn } from "@tanstack/react-start";
import { getAdminSession } from "../lib/auth/server";
import { invokePodscriberLambda } from "../lib/podscriber/lambda";
import { submitPodscriberForSession } from "../lib/podscriber/submit";

// PodscriberSubmitInput is the server function input from the admin form.
type PodscriberSubmitInput = {
  text: string;
};

export const submitPodscriberServerFn = createServerFn({ method: "POST" })
  .inputValidator((input: PodscriberSubmitInput) => input)
  .handler(async ({ data }) =>
    submitPodscriberForSession(data.text, {
      getSession: getAdminSession,
      invoke: invokePodscriberLambda,
    }),
  );
