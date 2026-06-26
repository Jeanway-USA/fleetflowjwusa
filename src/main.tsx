import React from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";

// --- Pre-init: purge obviously-dead Supabase auth storage ---------------
// Supabase JS auto-calls _recoverAndRefresh() on init. If a stale/expired
// refresh token is sitting in localStorage (deleted user, rotated token,
// old preview session), it POSTs to /token and throws an uncaught
// AuthApiError "refresh_token_not_found" before AuthContext can validate.
// We pre-scan storage and remove entries whose expires_at is already in
// the past so the SDK never tries to refresh a known-dead token.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!/^sb-.*-auth-token$/.test(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const expiresAt: number | undefined =
        parsed?.expires_at ?? parsed?.currentSession?.expires_at;
      if (typeof expiresAt === "number" && expiresAt * 1000 < Date.now()) {
        localStorage.removeItem(key);
      }
    } catch {
      // Malformed entry — drop it so the SDK doesn't choke on it.
      localStorage.removeItem(key);
    }
  }
} catch {
  /* localStorage unavailable — nothing to clean. */
}

// Silently swallow the specific, expected "refresh_token_not_found" error
// emitted by Supabase auto-refresh on boot. Everything else propagates so
// real bugs still surface.
const isRefreshTokenNotFound = (reason: unknown): boolean => {
  if (!reason || typeof reason !== "object") return false;
  const r = reason as Record<string, unknown>;
  if (r.code === "refresh_token_not_found") return true;
  const msg = typeof r.message === "string" ? r.message : "";
  return r.__isAuthError === true && /refresh token not found/i.test(msg);
};
window.addEventListener("unhandledrejection", (event) => {
  if (isRefreshTokenNotFound(event.reason)) event.preventDefault();
});
window.addEventListener("error", (event) => {
  if (isRefreshTokenNotFound((event as ErrorEvent).error)) event.preventDefault();
});

// Always unregister any previously-installed service workers and clear caches.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}
if ("caches" in window) {
  caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
);

