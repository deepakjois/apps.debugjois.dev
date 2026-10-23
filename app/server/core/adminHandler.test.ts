import { beforeEach, describe, expect, it } from "vitest";

const adminRoutes = import.meta.glob<{
  default: { fetch: (request: Request) => Promise<Response> };
}>(["../routes/api/admin/**/*.ts", "!../routes/api/admin/session.*.ts"], { eager: true });

beforeEach(() => {
  delete process.env.DEV_ADMIN_BYPASS;
});

describe("admin API routes", () => {
  it("finds the admin routes", () => {
    expect(Object.keys(adminRoutes).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(adminRoutes))(
    "%s rejects a request without a session",
    async (path, route) => {
      const method = path.match(/\.(get|post|put|patch|delete)\.ts$/)?.[1]?.toUpperCase() ?? "GET";
      const response = await route.default.fetch(
        new Request("https://apps.debugjois.dev/api/admin/any", {
          method,
          ...(method === "GET"
            ? {}
            : { headers: { "content-type": "application/json" }, body: "{}" }),
        }),
      );

      expect(response.status).toBe(401);
    },
  );
});
