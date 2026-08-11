import { Link } from "react-router";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { LegalDraftNotice } from "@/components/legal/LegalDraftNotice";
import { LegalSection } from "@/components/legal/LegalSection";

/**
 * The terms of service. Written from what the product actually does, carrying
 * the same pending-review notice as the privacy policy.
 */
export default function Terms() {
  return (
    <PageShell width="prose">
      <PageHeader
        title="Terms of service"
        description="The rules of the road, written in the language of the product."
      />
      <LegalDraftNotice page="terms" />

      <div className="mt-(--space-section) flex flex-col gap-(--space-section)">
        <LegalSection id="accepting" title="Accepting these terms">
          <p>
            By creating an account on Cairn you agree to these terms. If you are creating an
            account for a company, you agree on that company's behalf.
          </p>
        </LegalSection>

        <LegalSection id="the-service" title="What Cairn is">
          <p>
            Cairn is a job board and application system. It lets candidates find and apply to
            jobs, and lets approved employers post jobs and review the applications they receive.
          </p>
        </LegalSection>

        <LegalSection id="accounts" title="Accounts">
          <p>
            You are responsible for what happens under your account and for keeping your password
            to yourself. An employer account is not an entitlement to post: every recruiter
            account starts pending and is approved or refused by an administrator, and posting
            rights can be withdrawn.
          </p>
          <p>
            One person, one account. Automated account creation and bulk application are not
            permitted.
          </p>
        </LegalSection>

        <LegalSection id="posting" title="Posting a job">
          <p>
            A job listing must be a real opening. It must not be fraudulent, misleading, or a
            pretext for collecting applications you have no position for. Cairn may remove any
            listing at its discretion and, for a serious violation, suspend the account that
            posted it.
          </p>
          <p>
            You are responsible for what your listing says — including its accuracy about remote
            work, compensation and location — and for how you handle the applications you
            receive.
          </p>
        </LegalSection>

        <LegalSection id="candidates" title="If you are a candidate">
          <p>
            By applying, you send your profile and resume to the employer that owns that job. Do
            not include information you do not want that employer to have — a resume is exactly
            as private as the party it is disclosed to.
          </p>
          <p>
            You may browse without an account, but applying requires one. Creating multiple
            accounts to get around a restriction is a violation of these terms.
          </p>
        </LegalSection>

        <LegalSection id="acceptable-use" title="Acceptable use">
          <p>
            Do not attempt to break, overload, scrape, or probe Cairn beyond normal use. Do not
            try to read data that is not yours — including other candidates' details or
            applications addressed to jobs you do not own. Do not send unsolicited mail through
            the service.
          </p>
        </LegalSection>

        <LegalSection id="disclaimers" title="Disclaimers">
          <p>
            Cairn provides the service "as is" and "as available". It does not warrant that
            listings are accurate or that any employer will respond, and it is not a party to any
            hiring decision. The law implies no warranties here that these terms exclude.
          </p>
        </LegalSection>

        <LegalSection id="liability" title="Limitation of liability">
          <p>
            To the extent the law allows, Cairn is not liable for lost opportunities, lost
            profits, or any indirect or consequential loss arising from the service — including
            from a listing that turns out to be inaccurate.
          </p>
        </LegalSection>

        <LegalSection id="termination" title="Termination">
          <p>
            You can stop using Cairn at any time by closing your account. Cairn may suspend or
            close an account that violates these terms. Closing an account does not automatically
            delete records that the law or the platform's operation requires keeping.
          </p>
        </LegalSection>

        <LegalSection id="changes" title="Changes">
          <p>
            These terms can change as Cairn does. A change to something material will be
            announced on the site, and continued use after that counts as acceptance.
          </p>
        </LegalSection>

        <LegalSection id="contact" title="Questions">
          <p>
            Anything unclear here is worth a real question —{" "}
            <Link to="/contact" className="text-signal-text hover:underline">
              ask
            </Link>
            .
          </p>
        </LegalSection>
      </div>
    </PageShell>
  );
}
