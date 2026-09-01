/**
 * The signup trust signals — P4 of the console automation program.
 *
 * At the verification flip a recruiter has a name, an email, and proof they
 * control that email — nothing else. The one strong signal computable from
 * that is ownership of an address at an employer's own domain, so these
 * utilities exist to answer exactly one question strictly: does this email
 * live at a domain this platform already knows as a company's website?
 *
 * Strict by design: exact hostname equality after normalization, no
 * subdomain credit, no DNS. Every near-miss falls back to the human queue,
 * which costs nothing.
 */

/** The common free-mail providers. One list, one authority. */
export const FREE_MAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
] as const;

export function emailDomainOf(email: string): string {
  const at = email.lastIndexOf("@");
  if (at === -1) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

export function websiteHostOf(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

export function isFreeMailAddress(email: string): boolean {
  return (FREE_MAIL_DOMAINS as readonly string[]).includes(emailDomainOf(email));
}

/** The bar for auto-approval: the email lives at a known company's website host. */
export function signupDomainMatches(email: string, website: string): boolean {
  const emailDomain = emailDomainOf(email);
  if (!emailDomain) return false;
  const websiteHost = websiteHostOf(website);
  return websiteHost !== "" && emailDomain === websiteHost;
}
