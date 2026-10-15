/**
 * CloudForge configuration.
 * Base URL of the Node.js/Express REST API — every request is relative to this.
 * Override with VITE_API_URL (docker-compose sets it); defaults to the local backend.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:5000/api";
