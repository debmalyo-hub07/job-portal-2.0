import axios from "axios";

/**
 * Extracts a displayable message from an unknown thrown value.
 *
 * Call sites previously did `error.response.data.message`, which itself throws a
 * TypeError when the request failed before a response existed — a network error
 * or a CORS rejection produced an unhandled crash rather than a toast.
 */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message ?? error.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/** The `code` from the API's error envelope, or null if this was not one. */
export function getApiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as { code?: unknown } | undefined;
  return typeof data?.code === "string" ? data.code : null;
}
