/**
 * CloudForge configuration.
 * Base URL of the Node.js/Express REST API — every request is relative to this.
 */
export const API_BASE_URL: string =
  import.meta.env["VITE_API_URL"] ?? "http://localhost:5000/api";