import { describe, expect, test, vi } from "vitest";
import { getDailyLogForSession, saveDailyLogForSession } from "../../lib/logger/dailyLog";

const adminSession = { email: "deepak.jois@gmail.com", name: null, picture: null };

describe("daily log session helpers", () => {
  test("requires an admin session when loading the daily log", async () => {
    await expect(
      getDailyLogForSession({
        getSession: async () => null,
        getDailyLog: vi.fn(),
        saveDailyLog: vi.fn(),
      }),
    ).rejects.toThrow("Admin session required.");
  });

  test("loads the daily log for an admin session", async () => {
    const getDailyLog = vi.fn(async () => ({
      title: "2026-04-29.md",
      contents: "hello",
    }));

    await expect(
      getDailyLogForSession({
        getSession: async () => adminSession,
        getDailyLog,
        saveDailyLog: vi.fn(),
      }),
    ).resolves.toEqual({
      title: "2026-04-29.md",
      contents: "hello",
    });
    expect(getDailyLog).toHaveBeenCalledOnce();
  });

  test("saves the daily log for an admin session", async () => {
    const saveDailyLog = vi.fn(async (note) => note);

    await expect(
      saveDailyLogForSession(
        { title: "2026-04-29.md", contents: "hello" },
        {
          getSession: async () => adminSession,
          getDailyLog: vi.fn(),
          saveDailyLog,
        },
      ),
    ).resolves.toEqual({
      title: "2026-04-29.md",
      contents: "hello",
    });
    expect(saveDailyLog).toHaveBeenCalledWith({
      title: "2026-04-29.md",
      contents: "hello",
    });
  });
});
