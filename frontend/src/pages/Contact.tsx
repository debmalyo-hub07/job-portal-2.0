import { Link } from "react-router";
import { Building2, LifeBuoy, ShieldQuestion } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Reveal } from "@/lib/motion";
import { SUPPORT_EMAIL, mailtoHref } from "@/lib/contact";

const CHANNELS = [
  {
    icon: LifeBuoy,
    title: "Help with your account",
    body: "Sign-in trouble, a verification email that never arrived, an application you need withdrawn.",
    subject: "Account help",
  },
  {
    icon: Building2,
    title: "Employers",
    body: "Questions about approval, posting a role, or an account still showing as pending.",
    subject: "Employer enquiry",
  },
  {
    icon: ShieldQuestion,
    title: "Privacy and data",
    body: "A request about your own data, including correction or deletion, or a question about the privacy policy.",
    subject: "Privacy request",
  },
];

/**
 * Contact.
 *
 * Deliberately mail links rather than a form. A form needs an endpoint — a Zod
 * schema, a rate limit, a honeypot, escapeHtml on the way into an email body —
 * and none of that exists in the API yet. Shipping the input and the button
 * before the route would be a control that swallows what someone typed, which is
 * the one thing the project's no-dead-controls rule names outright. The form is
 * its own phase; this page becomes its fallback rather than being replaced.
 *
 * Each channel prefills a subject so an arriving message is already triaged, and
 * the address is shown as text as well as linked — a reader on a machine with no
 * mail client configured still gets something they can copy.
 */
export default function Contact() {
  return (
    <PageShell width="default" motion="standard">
      <PageHeader
        title="Contact"
        description="A person reads these. Pick whichever line fits and it lands in the right place."
      />

      {/* Per-card arrival rather than one wrapper fading on mount. The three
          channels sit at the top of the page, so this one is nearly immediate —
          the delay exists so the reader's eye is led left to right instead of
          having three cards land at once. */}
      <div className="grid gap-6 md:grid-cols-3">
        {CHANNELS.map((channel, i) => (
          <Reveal key={channel.title} delay={i * 0.06}>
            <div className="flex h-full flex-col rounded-surface border border-line bg-paper-raised p-(--space-card)">
              <channel.icon aria-hidden="true" className="mb-3 size-5 text-signal-text" />
              <h2 className="font-display text-xl font-semibold text-ink">{channel.title}</h2>
              <p className="mt-2 flex-1 text-sm text-ink-muted">{channel.body}</p>
              <a
                href={mailtoHref(channel.subject)}
                className="mt-4 text-sm font-medium text-signal-text hover:underline"
              >
                Email about {channel.title.toLowerCase()}
              </a>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-(--space-section)">
        <div className="rounded-surface border border-line p-(--space-card)">
          <h2 className="font-display text-xl font-semibold text-ink">Or write directly</h2>
          <p className="mt-2 text-ink-muted">
            <a href={mailtoHref()} className="text-signal-text hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-4 text-sm text-ink-muted">
            Many questions are already answered on the{" "}
            <Link to="/help" className="text-signal-text hover:underline">
              help page
            </Link>
            , including what happens to your resume and why an employer account starts pending.
          </p>
        </div>
      </Reveal>
    </PageShell>
  );
}
