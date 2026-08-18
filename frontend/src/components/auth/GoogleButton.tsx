import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "../ui/button";

/**
 * Google's "G", drawn rather than imported.
 *
 * These four hex values are the only colours in the app that are not tokens, and
 * the exemption is deliberate: this is Google's mark, used under branding terms
 * that require it unaltered. Recolouring it to `--signal` would make it a
 * different company's logo, so it does not take part in the theme and must not be
 * "fixed" into tokens later. The colour linter matches Tailwind utilities rather
 * than SVG attributes, so it does not object — that is a gap in the check, not
 * permission to add a fifth palette anywhere else.
 *
 * The mark is the reason this button is recognisable at a glance. "Continue with
 * Google" set in the app's own face, with no mark, read as a second submit
 * button sitting under the first.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-[1.15rem]">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * The Google sign-in door for one portal.
 *
 * `startPath` comes from `AUTH_COPY`, which is null on admin — the API mounts no
 * Google routes there, so the caller renders nothing rather than a control that
 * can only 404.
 *
 * The pending state is the point. `location.assign` is a full top-level
 * navigation, and until Google answers the page is simply still here: without
 * feedback the button looks inert for as long as that round trip takes, which
 * reads as a failed click and invites a second one. Disabling it makes the second
 * click harmless too.
 *
 * Assigning `location` in the handler looks like it should lose the race — the
 * assignment is synchronous and React has not committed the pending render yet.
 * It does not: Chromium keeps painting the old document until the new response
 * commits, which leaves room for the frame. Measured with a `requestAnimationFrame`
 * loop reporting the button's text on a real navigation to Google — the pending
 * label held for roughly 200ms, about six frames.
 *
 * Worth knowing if this is ever revisited: the jsdom test cannot answer that
 * question, because it stubs `assign` and so never navigates at all. Nor can
 * Playwright's `route()` — intercepting a top-level navigation changes when the
 * document is torn down, and under interception this same button appeared never
 * to paint.
 */
export function GoogleButton({ startPath }: { startPath: string }) {
  const [pending, setPending] = useState(false);
  // A real navigation, not a fetch: the OAuth flow is a series of top-level
  // redirects and XHR cannot follow them.
  const href = `${import.meta.env.VITE_API_URL}${startPath}`;

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => {
        setPending(true);
        window.location.assign(href);
      }}
    >
      {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <GoogleMark />}
      {pending ? "Taking you to Google..." : "Continue with Google"}
    </Button>
  );
}
