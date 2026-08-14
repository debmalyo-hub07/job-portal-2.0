import { useMemo, useState } from "react";
import { BriefcaseBusiness, Search, ShieldCheck, UserRoundSearch } from "lucide-react";
import { Link } from "react-router";

import { PageShell } from "@/components/layout/PageShell";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/lib/motion";

type Category = "Candidates" | "Employers" | "Accounts & safety";
type Faq = { category: Category; question: string; answer: string };

const FAQS: Faq[] = [
  {
    category: "Candidates",
    question: "Do I need an account to look at jobs?",
    answer: "No. The board, filters, and every job description are public. You need a verified candidate account only when you apply or save profile information.",
  },
  {
    category: "Candidates",
    question: "What information improves my fit score?",
    answer: "Skills, experience, preferred location, salary range, and remote-work preference. Every field is optional; leaving one blank removes that factor instead of counting it as a bad match.",
  },
  {
    category: "Candidates",
    question: "Who can see my resume and contact details?",
    answer: "Only the employer that owns a job you applied to can read the application profile for that job. Your candidate profile is not a public directory.",
  },
  {
    category: "Candidates",
    question: "Can I withdraw an application?",
    answer: "Not through self-service yet. Contact support with the account email and job link so the request can be handled manually.",
  },
  {
    category: "Candidates",
    question: "Why can a remote job still name a city?",
    answer: "Remote status and location are separate. The city can identify the office or hiring region while the work itself remains remote.",
  },
  {
    category: "Employers",
    question: "Why can I sign in but not create a company or post a role?",
    answer: "A recruiter account starts pending. An administrator must approve it before the employer workspace allows company creation, job posting, or applicant review.",
  },
  {
    category: "Employers",
    question: "What should I prepare before posting?",
    answer: "A company name and context, a specific role title, responsibilities, requirements, location, remote status, experience level, compensation, job type, and number of openings.",
  },
  {
    category: "Employers",
    question: "Can several recruiters share one company account?",
    answer: "Not yet. A company currently has one owning recruiter. Team membership and role-based employer access remain planned work.",
  },
  {
    category: "Employers",
    question: "Can I edit a published job?",
    answer: "Published job editing is not available yet. Company details can be updated; a corrected job must currently be published as a new role.",
  },
  {
    category: "Accounts & safety",
    question: "How are passwords stored?",
    answer: "Passwords are stored only as Argon2 hashes. Cairn cannot recover the original password; reset uses a short-lived one-time code delivered by email.",
  },
  {
    category: "Accounts & safety",
    question: "How are additional administrators created?",
    answer: "There is no public admin signup. A signed-in admin must invite another admin using a private server-verified provisioning key, after which the new admin receives a one-time password setup code.",
  },
  {
    category: "Accounts & safety",
    question: "What happens when I sign in with Google?",
    answer: "Google sign-in is available to candidate and recruiter accounts, not administrators. Linking to an existing verified account requires mailbox confirmation before the sign-in method changes.",
  },
  {
    category: "Accounts & safety",
    question: "Can I delete my account?",
    answer: "Account deletion is not self-service yet. Contact support from the account email and the request will be handled manually.",
  },
];

const CATEGORY_META = {
  Candidates: { icon: UserRoundSearch, description: "Searching, profiles, fit, resumes, and applications." },
  Employers: { icon: BriefcaseBusiness, description: "Approval, companies, job posting, and applicant review." },
  "Accounts & safety": { icon: ShieldCheck, description: "Identity, passwords, Google sign-in, admins, and data requests." },
} satisfies Record<Category, { icon: typeof Search; description: string }>;

export default function Help() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const categories = useMemo(() => {
    return (Object.keys(CATEGORY_META) as Category[]).map((category) => ({
      category,
      faqs: FAQS.filter(
        (faq) =>
          faq.category === category &&
          (!normalized || `${faq.question} ${faq.answer}`.toLowerCase().includes(normalized)),
      ),
    }));
  }, [normalized]);
  const resultCount = categories.reduce((count, category) => count + category.faqs.length, 0);

  return (
    <PageShell width="wide" motion="standard">
      <header className="grid gap-10 border-b border-line pb-12 lg:grid-cols-[1fr_0.9fr] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-signal-text">Help & FAQ</p>
          <h1 className="mt-3 max-w-3xl font-display text-display-lg font-semibold text-balance text-ink">
            Help for how the product works today.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-ink-muted">
            This page includes the gaps as well as the finished workflows, so you do not have to infer whether a missing control is hidden or simply not built yet.
          </p>
        </div>
        <div>
          <label htmlFor="faq-search" className="text-sm font-semibold text-ink">
            Search the FAQ
          </label>
          <div className="mt-3 flex items-center gap-3 border-b-2 border-ink pb-2 focus-within:border-signal">
            <Search aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
            <Input
              id="faq-search"
              name="faqSearch"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Approval, resume, password..."
              className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <p className="mt-3 min-h-5 text-xs text-ink-muted" aria-live="polite">
            {normalized ? `${resultCount} matching answer${resultCount === 1 ? "" : "s"}` : `${FAQS.length} answers across 3 topics`}
          </p>
        </div>
      </header>

      <div className="mt-(--space-section) grid gap-14 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
        <aside className="self-start lg:sticky lg:top-28">
          <p className="text-xs font-semibold uppercase text-ink-muted">Topics</p>
          <nav aria-label="FAQ topics" className="mt-4 space-y-1">
            {(Object.keys(CATEGORY_META) as Category[]).map((category) => {
              const Icon = CATEGORY_META[category].icon;
              return (
                <a
                  key={category}
                  href={`#faq-${category.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}
                  className="flex items-center gap-3 py-2 text-sm text-ink-muted transition-[color,transform] duration-(--dur-fast) hover:translate-x-1 hover:text-ink focus-visible:text-ink focus-visible:outline-none"
                >
                  <Icon aria-hidden="true" className="size-4 text-signal-text" />
                  {category}
                </a>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-16">
          {categories.map(({ category, faqs }) => {
            if (normalized && faqs.length === 0) return null;
            const meta = CATEGORY_META[category];
            const Icon = meta.icon;
            const id = `faq-${category.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`;
            return (
              <Reveal key={category}>
                <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-28">
                  <div className="flex items-start gap-4 border-b border-line pb-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-sharp bg-signal-muted text-signal-text">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <h2 id={`${id}-heading`} className="font-display text-display-sm font-semibold text-ink">
                        {category}
                      </h2>
                      <p className="mt-1 text-sm text-ink-muted">{meta.description}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-line">
                    {faqs.map((faq, index) => (
                      <details key={faq.question} className="group py-1" open={Boolean(normalized)}>
                        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-left font-semibold text-ink outline-none marker:hidden focus-visible:text-signal-text [&::-webkit-details-marker]:hidden">
                          <span className="flex gap-4">
                            <span className="font-mono text-xs text-ink-muted">{String(index + 1).padStart(2, "0")}</span>
                            <span>{faq.question}</span>
                          </span>
                          <span aria-hidden="true" className="text-xl font-normal text-signal-text transition-transform duration-(--dur-fast) group-open:rotate-45">+</span>
                        </summary>
                        <p className="max-w-3xl pb-6 pl-10 text-sm leading-7 text-ink-muted">{faq.answer}</p>
                      </details>
                    ))}
                  </div>
                </section>
              </Reveal>
            );
          })}

          {resultCount === 0 ? (
            <div className="border-y border-line py-10">
              <h2 className="font-display text-2xl font-semibold text-ink">No matching answer</h2>
              <p className="mt-3 text-sm text-ink-muted">
                Try a broader phrase or send the question through the{" "}
                <Link to="/contact" className="font-semibold text-signal-text hover:underline">contact page</Link>.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
