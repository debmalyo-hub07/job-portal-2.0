export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";

export const turnstileEnabled = turnstileSiteKey.length > 0;

export function turnstileRequestConfig(token: string | null) {
  return token
    ? ([{ headers: { "X-Turnstile-Token": token } }] as const)
    : ([] as const);
}
