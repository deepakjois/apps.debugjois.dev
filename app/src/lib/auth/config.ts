export const GOOGLE_CLIENT_ID =
  "1056519509576-4av02t7h19bafa5dtfspcfod1in63eup.apps.googleusercontent.com";

export const AUTH_COOKIE_NAME = "apps_debugjois_dev_admin_session";

// localStorage key holding the last admin email, used as Google's login_hint on this browser.
export const LAST_ADMIN_EMAIL_STORAGE_KEY = "apps_debugjois_dev_admin_last_email";

// Only verified Google identities in this set receive an admin session.
export const ALLOWED_ADMIN_EMAILS = new Set(["deepak.jois@gmail.com"]);

export const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
