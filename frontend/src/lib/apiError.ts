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
    const data = error.response?.data as
      | { code?: unknown; message?: string; details?: unknown }
      | undefined;
    // A validation failure's own `message` is the generic "Request validation
    // failed."; the useful sentence is in `details`, which carries the Zod issues.
    // Without this the under-18 copy — the one refusal on the platform that has to
    // explain itself, because it means "not yet" rather than "no" — reached the
    // user as a shrug. Every other schema message was equally invisible.
    if (data?.code === "VALIDATION_ERROR") {
      const first = Array.isArray(data.details) ? data.details[0] : undefined;
      const issue = (first as { message?: unknown } | undefined)?.message;
      if (typeof issue === "string" && issue.trim()) return issue;
    }
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
