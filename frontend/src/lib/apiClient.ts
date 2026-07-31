import axios from "axios";

/**
 * Single configured client. `withCredentials` is set once here rather than
 * repeated at every call site, where it is easy to forget — and forgetting it
 * silently drops the auth cookie.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});
