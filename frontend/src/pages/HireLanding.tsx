import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardList, Send, Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { FadeIn, StaggerItem, StaggerList } from "@/lib/motion";
import { useAppSelector } from "@/redux/store";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Create a company",
    body: "One profile your whole team posts under.",
  },
  {
    icon: Send,
    title: "Post a role",
    body: "Title, requirements, salary band, location.",
  },
  {
    icon: Users,
    title: "See every applicant",
    body: "Profile and resume, already parsed.",
  },
];

/**
 * The employer front door.
 *
 * Before this page existed, an anonymous visitor who wanted to hire had nowhere
 * to land: the workspace bounced them to the seeker home, so someone arriving
 * to post a job was shown "Get Your Dream Job".
 *
 * Marketing surface, so it runs spacious density even though the portal is
 * recruiter — density follows the surface's job, not the portal.
 */
export default function HireLanding() {
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.portal === "recruiter") navigate("/hire/companies", { replace: true });
  }, [user?.portal, navigate]);

  return (
    <PageShell width="wide">
      <FadeIn>
        <p className="mb-4 inline-flex rounded-full bg-signal-muted px-3 py-1 text-sm font-medium text-signal-text">
          For employers
        </p>
        <h1 className="max-w-3xl font-display text-display-lg font-bold text-balance text-ink">
          Hire without the noise.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted">
          Post a role, see every applicant in one place, and decide faster.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild variant="signal" size="lg">
            <Link to="/hire/signup">
              Start hiring <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/hire/login">Sign in</Link>
          </Button>
        </div>
      </FadeIn>

      <StaggerList className="mt-(--space-section) grid gap-6 md:grid-cols-3">
        {STEPS.map((step) => (
          <StaggerItem key={step.title}>
            <div className="h-full rounded-surface border border-line bg-paper-raised p-(--space-card)">
              <step.icon aria-hidden="true" className="mb-3 size-5 text-signal-text" />
              <h2 className="font-display text-xl font-semibold text-ink">{step.title}</h2>
              <p className="mt-2 text-sm text-ink-muted">{step.body}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerList>

      <p className="mt-(--space-section) border-t border-line pt-6 text-sm text-ink-muted">
        Looking for a job instead?{" "}
        <Link to="/" className="text-signal-text hover:underline">
          Browse open roles
        </Link>
      </p>
    </PageShell>
  );
}
