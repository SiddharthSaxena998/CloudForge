import axios from "axios";
import { API_BASE_URL } from "@/config";

/** API_BASE_URL lives in src/config.ts. */
export { API_BASE_URL };

export const TOKEN_STORAGE_KEY = "cloudforge.token";
export const USER_STORAGE_KEY = "cloudforge.user";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
    return Promise.reject(error);
  },
);

/** Turns any request failure into a short, human-readable message. */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return "Unable to connect to server. Check that the API is running.";
    const data = error.response.data as { message?: string; error?: string } | undefined;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    if (error.response.status === 401) return "Your session has expired. Please sign in again.";
    if (error.response.status === 403) return "You do not have permission to do that.";
    if (error.response.status === 404) return "The requested item was not found on the server.";
    return `Server error (${error.response.status}). Please try again.`;
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}