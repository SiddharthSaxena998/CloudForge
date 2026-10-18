/**
 * CloudForge configuration.
 * Base URL of the Node.js/Express REST API — every request is relative to this.
 *
 * VITE_API_URL:
 *   - an absolute URL (docker-compose sets http://localhost:5000/api for local use)
 *   - "same-origin": the dashboard and the API are served from the same host behind the gateway
 *     (docker compose --profile public). The browser then talks to <current host>/api, so one
 *     public link is enough for everything.
 *   - unset: http://localhost:5000/api
 */
const LOCAL_API = "http://localhost:5000/api";
const configured = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE_URL: string =
  configured === "same-origin"
    ? typeof window !== "undefined"
      ? `${window.location.origin}/api`
      : LOCAL_API
    : configured || LOCAL_API;
