import type { DailyLogNote } from "./types";

// AdminSessionForLogger is the small auth shape needed to prove admin access.
type AdminSessionForLogger = {
  email: string;
  name: string | null;
  picture: string | null;
};

// DailyLogDeps keeps auth and Lambda dependencies injectable for tests.
type DailyLogDeps = {
  getSession: () => Promise<AdminSessionForLogger | null>;
  getDailyLog: () => Promise<DailyLogNote>;
  saveDailyLog: (note: DailyLogNote) => Promise<DailyLogNote>;
};

export async function getDailyLogForSession(deps: DailyLogDeps): Promise<DailyLogNote> {
  const session = await deps.getSession();
  if (!session) {
    throw new Error("Admin session required.");
  }

  return deps.getDailyLog();
}

export async function saveDailyLogForSession(
  note: DailyLogNote,
  deps: DailyLogDeps,
): Promise<DailyLogNote> {
  const session = await deps.getSession();
  if (!session) {
    throw new Error("Admin session required.");
  }

  return deps.saveDailyLog(note);
}
