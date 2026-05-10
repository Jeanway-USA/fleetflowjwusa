import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Always unregister any previously-installed service workers and clear caches.
// PWA support has been removed; this prevents stale app shells from being served.
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
    <App />
  </React.StrictMode>
);
