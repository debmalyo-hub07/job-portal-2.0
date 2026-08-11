import { Link } from "react-router";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FadeIn } from "@/lib/motion";

type Faq = { q: string; a: React.ReactNode };

const CANDIDATE_FAQS: Faq[] = [
  {
    q: "Do I need an account to look at jobs?",
    a: "No. The board, the filters and every listing are readable signed out. An account is needed to apply, because an application has to belong to someone.",
  },
  {
    q: "What happens to my resume?",
    a: "It is stored as a private file, not a public URL. When an employer whose job you applied to opens it, the link is generated at that moment and expires in about ten minutes. Employers whose jobs you did not apply to cannot reach it at all.",
  },
  {
    q: "Who can see my email and phone number?",
    a: "Only the employer that owns a job you applied to, and only for that application. Nothing about your profile is on the public board.",
  },
  {
    q: "Can I withdraw an application?",
    a: "Not yet. This is the honest answer rather than a maybe: applications are one-way today, and withdrawal is queued work.",
  },
  {
    q: "Why does a job say remote when the location is a city?",
    a: "Remote and location are separate fields — a role can be remote-first and still be attached to the office that owns the headcount. Filter by Remote if that is what matters.",
  },
];

const EMPLOYER_FAQS: Faq[] = [
  {
    q: "Why can I sign in but not post a job?",
    a: "Employer accounts start pending and an administrator approves them. It exists so that nobody can invent a company, post a role and start collecting resumes. You will get an email either way.",
  },
  {
    q: "How long does approval take?",
    a: "It is a person reading it, so there is no SLA yet. If it has been longer than you would expect, get in touch.",
  },
  {
    q: "Can several people post under one company?",
    a: "One company profile has one owner today. Shared team access is queued work.",
  },
  {
    q: "Can I edit a job after posting it?",
    a: "Company details, yes. A posted job is not editable yet — the current answer is to post the corrected role.",
  },
];

function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <dl className="mt-(--space-card) divide-y divide-line border-t border-line">
      {faqs.map((faq) => (
        <div key={faq.q} className="py-(--space-card)">
          <dt className="font-display text-xl font-semibold text-ink">{faq.q}</dt>
          <dd className="mt-2 max-w-2xl text-ink-muted">{faq.a}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Help and FAQ.
 *
 * Every answer here is about behaviour that actually ships. Where something does
 * not exist yet — withdrawing an application, editing a posted job, team access —
 * it says so plainly rather than being omitted, because a missing answer reads as
 * "it probably works" and sends the reader to support.
 *
 * A `<dl>` rather than an accordion: the answers are short, and collapsing five
 * of them costs a click each to hide nothing worth hiding.
 */
export default function Help() {
  return (
    <PageShell width="default">
      <PageHeader
        title="Help & FAQ"
        description="How Cairn works, including the parts that do not work yet."
      />

      <FadeIn>
        <section aria-labelledby="faq-candidates">
          <h2
            id="faq-candidates"
            className="font-display text-display-sm font-semibold text-ink"
          >
            If you are looking for work
          </h2>
          <FaqList faqs={CANDIDATE_FAQS} />
        </section>

        <section
          aria-labelledby="faq-employers"
          className="mt-(--space-section)"
        >
          <h2 id="faq-employers" className="font-display text-display-sm font-semibold text-ink">
            If you are hiring
          </h2>
          <FaqList faqs={EMPLOYER_FAQS} />
        </section>

        <p className="mt-(--space-section) rounded-surface border border-line bg-paper-raised p-(--space-card) text-ink-muted">
          Not answered here?{" "}
          <Link to="/contact" className="text-signal-text hover:underline">
            Send us the question
          </Link>{" "}
          — the ones that recur end up on this page.
        </p>
      </FadeIn>
    </PageShell>
  );
}
