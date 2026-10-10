/**
 * ============================================================
 *  CloudForge configuration — the ONLY two switches you need.
 * ============================================================
 */

/**
 * USE_MOCK_API
 *   true  -> every page uses the built-in sample data (no server needed).
 *            Safe fallback for demos if the backend is unavailable.
 *   false -> every page talks to the real Express + MongoDB backend
 *            at API_BASE_URL, with real login and JWT tokens.
 */
export const USE_MOCK_API = true;

/** Base URL of the Node.js/Express REST API (all endpoints are relative to this). */
export const API_BASE_URL = "http://localhost:5000/api";