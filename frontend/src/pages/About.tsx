import { Link } from "react-router";
import { Compass, Route, Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { FadeIn, StaggerItem, StaggerList } from "@/lib/motion";

const PRINCIPLES = [
  {
    icon: Compass,
    title: "A job board should be legible",
    body: "Every filter you set lives in the URL, so the search you ran is a link you can send someone. Nothing about a listing is hidden behind a sign-up wall.",
  },
  {
    icon: Users,
    title: "Employers are reviewed before they post",
    body: "A recruiter account starts pending and an administrator approves it. Anyone can read the board; not anyone can advertise on it or see who applied.",
  },
  {
    icon: Route,
    title: "Your files stay yours",
    body: "A resume is uploaded as a private asset and served through a short-lived signed link. It is not a public URL that outlives your application.",
  },
];

/**
 * The About page.
 *
 * Written to answer the question a stranger actually has before uploading a CV —
 * who runs this and what happens to my data — rather than the question a
 * marketing page usually answers.
 */
export default function About() {
  return (
    <PageShell width="default" motion="ambient">
      <FadeIn>
        <p className="mb-4 inline-flex rounded-full bg-signal-muted px-3 py-1 text-sm font-medium text-signal-text">
          About
        </p>
        <h1 className="max-w-3xl font-display text-display-lg font-bold text-balance text-ink">
          Mark the way for whoever is next.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-muted">
          A cairn is a stack of stones one traveller leaves so the next can find the path. Looking
          for work is the same problem: the people who have just done it know things the people
          starting out cannot see.
        </p>
      </FadeIn>

      <StaggerList className="mt-(--space-section) grid gap-6 md:grid-cols-3">
        {PRINCIPLES.map((principle) => (
          <StaggerItem key={principle.title}>
            <div className="h-full rounded-surface border border-line bg-paper-raised p-(--space-card)">
              <principle.icon aria-hidden="true" className="mb-3 size-5 text-signal-text" />
              <h2 className="font-display text-xl font-semibold text-ink">{principle.title}</h2>
              <p className="mt-2 text-sm text-ink-muted">{principle.body}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerList>

      <section className="mt-(--space-section) border-t border-line pt-(--space-card)">
        <h2 className="font-display text-display-sm font-semibold text-ink">Where it stands</h2>
        <p className="mt-3 max-w-2xl text-ink-muted">
          Cairn is early. The job board, applications, the employer workspace and the moderation
          console all work; the board is not yet full. If you want to be told when it is,{" "}
          <Link to="/contact" className="text-signal-text hover:underline">
            say so
          </Link>
          .
        </p>
      </section>
    </PageShell>
  );
}
