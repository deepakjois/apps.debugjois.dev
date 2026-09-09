import { createServerFn } from "@tanstack/react-start";
import { getAdminSession } from "../lib/auth/server";
import { getDailyLogForSession, saveDailyLogForSession } from "../lib/logger/dailyLog";
import { getLoggerLinkPreviewForSession } from "../lib/logger/linkPreview";
import { invokeGetDailyLogLambda, invokePostDailyLogLambda } from "../lib/logger/lambda";
import type { DailyLogNote } from "../lib/logger/types";
import { fetchLoggerLinkPreview } from "../queries/queries";

type LoggerLinkPreviewInput = {
  url: string;
};

export const getDailyLogServerFn = createServerFn({ method: "GET" }).handler(async () =>
  getDailyLogForSession({
    getSession: getAdminSession,
    getDailyLog: invokeGetDailyLogLambda,
    saveDailyLog: invokePostDailyLogLambda,
  }),
);

export const saveDailyLogServerFn = createServerFn({ method: "POST" })
  .inputValidator((input: DailyLogNote) => input)
  .handler(async ({ data }) =>
    saveDailyLogForSession(data, {
      getSession: getAdminSession,
      getDailyLog: invokeGetDailyLogLambda,
      saveDailyLog: invokePostDailyLogLambda,
    }),
  );

export const getLoggerLinkPreviewServerFn = createServerFn({ method: "POST" })
  .inputValidator((input: LoggerLinkPreviewInput) => input)
  .handler(async ({ data }) =>
    getLoggerLinkPreviewForSession(data.url, {
      getSession: getAdminSession,
      getApiKey: () => process.env.LINKPREVIEW_API_KEY,
      fetchLinkPreview: fetchLoggerLinkPreview,
    }),
  );
