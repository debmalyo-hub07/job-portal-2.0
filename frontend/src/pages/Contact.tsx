import { ArrowUpRight, Building2, Clock3, LifeBuoy, ShieldQuestion } from "lucide-react";
import { Link } from "react-router";

import { PageShell } from "@/components/layout/PageShell";
import { Reveal } from "@/lib/motion";
import { SUPPORT_EMAIL, mailtoHref } from "@/lib/contact";

const CHANNELS = [
  {
    icon: LifeBuoy,
    eyebrow: "Account support",
    title: "Sign-in, verification, or an application",
    body: "Use this for a code that did not arrive, access trouble, or a request concerning an application attached to your account.",
    subject: "Account support",
  },
  {
    icon: Building2,
    eyebrow: "Employer support",
    title: "Approval, company setup, or a published role",
    body: "Use this for an employer account still pending, a company detail that needs correction, or a role that needs operational help.",
    subject: "Employer support",
  },
  {
    icon: ShieldQuestion,
    eyebrow: "Privacy & safety",
    title: "Data rights, suspicious activity, or a listing concern",
    body: "Use this for correction or deletion requests, suspected misuse, or a job or company that should be reviewed.",
    subject: "Privacy and safety",
  },
] as const;

export default function Contact() {
  return (
    <PageShell width="wide" motion="standard">
      <header className="grid gap-10 border-b border-line pb-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-signal-text">Contact</p>
          <h1 className="mt-3 max-w-3xl font-display text-display-lg font-semibold text-balance text-ink">
            Contact Cairn without entering a support maze.
          </h1>
        </div>
        <div className="border-l border-line pl-6">
          <p className="text-sm leading-7 text-ink-muted">
            Cairn does not yet run a support-ticket backend, so every channel opens a pre-addressed email instead of presenting a form that cannot reliably deliver what you write.
          </p>
          <div className="mt-5 flex items-center gap-3 text-sm text-ink-muted">
            <Clock3 aria-hidden="true" className="size-4 text-signal-text" />
            <span>No automated promise: a person reads the mailbox.</span>
          </div>
        </div>
      </header>

      <section className="mt-(--space-section) border-t border-line" aria-label="Contact channels">
        {CHANNELS.map((channel, index) => (
          <Reveal key={channel.title} delay={index * 0.05}>
            <a
              href={mailtoHref(channel.subject)}
              className="group grid gap-6 border-b border-line py-8 transition-[background-color,padding] duration-(--dur-base) hover:bg-signal-muted/45 focus-visible:bg-signal-muted/45 focus-visible:outline-none md:grid-cols-[3rem_0.8fr_1.3fr_auto] md:items-center md:px-3"
            >
              <span className="font-mono text-sm text-ink-muted">0{index + 1}</span>
              <div className="flex items-center gap-3">
                <channel.icon aria-hidden="true" className="size-5 text-signal-text" />
                <span className="text-xs font-semibold uppercase text-signal-text">{channel.eyebrow}</span>
              </div>
              <div>
                <h2 className="font-display text-2xl font-semibold text-ink">{channel.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-muted">{channel.body}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-full border border-line text-ink transition-[transform,border-color,color] duration-(--dur-fast) group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:border-signal group-hover:text-signal-text">
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </span>
            </a>
          </Reveal>
        ))}
      </section>

      <Reveal className="mt-(--space-section) grid gap-8 border-y border-line bg-paper-sunken px-6 py-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase text-signal-text">Direct address</p>
          <a
            href={mailtoHref()}
            className="mt-3 block break-words font-display text-3xl font-semibold text-ink transition-colors hover:text-signal-text sm:text-4xl"
          >
            {SUPPORT_EMAIL}
          </a>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">
            Include the email address on your Cairn account and the relevant job or company link. Never send a password, one-time code, or provisioning key.
          </p>
        </div>
        <Link
          to="/help"
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-signal-text"
        >
          Check the FAQ first
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </Reveal>
    </PageShell>
  );
}
