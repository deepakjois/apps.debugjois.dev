export const GOOGLE_CLIENT_ID =
  "1056519509576-4av02t7h19bafa5dtfspcfod1in63eup.apps.googleusercontent.com";

export const AUTH_COOKIE_NAME = "apps_debugjois_dev_admin_session";

export const ADMIN_SESSION_COOKIE = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 7,
} as const;

export const LAST_ADMIN_EMAIL_STORAGE_KEY = "apps_debugjois_dev_admin_last_email";

export const ALLOWED_ADMIN_EMAILS = new Set(["deepak.jois@gmail.com"]);

export const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
