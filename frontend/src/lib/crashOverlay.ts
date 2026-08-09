/**
 * Last-resort white-screen diagnostic.
 *
 * MUST be the first import in `main.tsx`. ES module evaluation is depth-first in
 * source order, so a handler registered in main.tsx's *body* is installed only
 * after every imported module has already evaluated — which means it cannot
 * catch the most common cause of a blank page: a module that throws at import
 * time. That is not hypothetical. `redux/store.ts` threw
 * `createWebStorage is not a function` at import under Vite 8, and the handler
 * written to report exactly that never ran, so the page was silently empty with
 * a clean network tab.
 *
 * Being imported first means this module's body runs before any sibling import
 * evaluates, so those throws are caught.
 */

function render(detail: string): void {
  const el = document.getElementById("root");
  // Only speak up if nothing painted. A late error in a working app belongs in
  // the console, not stamped over the UI the user is currently using.
  if (!el || el.childElementCount > 0) return;

  const body = import.meta.env.DEV
    ? detail
    : "The application failed to start. Please reload; if this persists, contact support.";

  el.textContent = "";
  const pre = document.createElement("pre");
  pre.setAttribute(
    "style",
    "margin:0;padding:24px;color:#b91c1c;background:#fff;" +
      "font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word",
  );
  pre.textContent = body;
  el.appendChild(pre);
}

/**
 * `textContent` rather than `innerHTML`: an error message can contain attacker-
 * influenced text (a URL, a server response fragment), and injecting that as
 * markup on a crash path would be a self-inflicted XSS in the one code path
 * where nothing else is working.
 */
function installCrashOverlay(): void {
  window.addEventListener("error", (event) => {
    const err = event.error as Error | undefined;
    render(err?.stack ?? err?.message ?? event.message ?? "Unknown error");
    if (import.meta.env.DEV) console.error("[crash-overlay]", err ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as Error | string | undefined;
    const detail =
      reason instanceof Error
        ? (reason.stack ?? reason.message)
        : String(reason ?? "Unknown rejection");
    render(detail);
    if (import.meta.env.DEV) console.error("[crash-overlay] unhandled rejection", reason);
  });
}

// Side effect on import, deliberately. An exported installer that `main.tsx`
// called would run after every import had evaluated — precisely the failure this
// module exists to report.
installCrashOverlay();
