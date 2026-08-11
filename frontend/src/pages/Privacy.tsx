import { Link } from "react-router";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { LegalDraftNotice } from "@/components/legal/LegalDraftNotice";
import { LegalSection } from "@/components/legal/LegalSection";

/**
 * The privacy policy.
 *
 * Every claim here was written against the code rather than from a template: the
 * resume paragraph describes Cloudinary authenticated assets and ~10-minute
 * signed URLs because that is what `job.service` mints, and the cookie paragraph
 * names three cookies because that is what `cookies.ts` sets. A policy that
 * describes a system nobody built is worse than none — it is a promise made in
 * public and broken in private.
 *
 * It carries `LegalDraftNotice` because the entity, jurisdiction and
 * sub-processor list are genuinely unfilled. See that component.
 */
export default function Privacy() {
  return (
    <PageShell width="prose">
      <PageHeader
        title="Privacy policy"
        description="What Cairn collects, why, and how long it keeps it."
      />
      <LegalDraftNotice page="policy" />

      <div className="mt-(--space-section) flex flex-col gap-(--space-section)">
        <LegalSection id="what-we-collect" title="What we collect">
          <p>
            <strong>When you create an account:</strong> your name, email address and a password,
            which is stored only as an Argon2 hash — it is never stored, logged or recoverable in
            plain text. If you sign in with Google we receive your name, email address and profile
            image from Google and store the same fields.
          </p>
          <p>
            <strong>When you build a profile:</strong> anything you choose to add — a headline, a
            phone number, skills and a resume file. All of it is optional except what an
            application needs.
          </p>
          <p>
            <strong>When you apply to a job:</strong> a record linking your account to that job,
            its status, and the time you applied.
          </p>
          <p>
            <strong>Automatically:</strong> server logs containing IP address, user agent and the
            path requested. These exist to find faults and to rate-limit abuse.
          </p>
        </LegalSection>

        <LegalSection id="resumes" title="Resumes and files">
          <p>
            A resume is uploaded to Cloudinary as an <em>authenticated</em> asset, not a public
            one. Cairn stores only its identifier. Each time an authorised reader opens it, a
            signed URL valid for roughly ten minutes is generated on demand; there is no permanent
            public address for your file.
          </p>
          <p>
            Only an employer that owns a job you applied to can trigger that. An employer whose
            job you did not apply to receives the same answer as one asking for a resume that does
            not exist.
          </p>
        </LegalSection>

        <LegalSection id="who-sees-it" title="Who can see your information">
          <p>
            Your name, email, phone number, headline, skills and resume link are disclosed to the
            employer that owns a job you applied to, for that application. That is the entire
            purpose of applying and it is the only routine disclosure Cairn makes.
          </p>
          <p>
            Administrators can see accounts and their status in order to review employers and
            moderate listings. They do not receive candidate contact details as part of that work.
          </p>
          <p>Cairn does not sell personal information and does not run third-party ad tracking.</p>
        </LegalSection>

        <LegalSection id="cookies" title="Cookies">
          <p>
            Cairn sets three cookies, all strictly necessary and none for advertising or analytics:
            a session cookie and a refresh cookie, both <code>httpOnly</code> so that browser
            JavaScript cannot read them, and a CSRF cookie that lets the server verify a write came
            from a page it served. There is no cookie banner because there is nothing optional to
            consent to.
          </p>
        </LegalSection>

        <LegalSection id="processors" title="Who processes data for us">
          <p>
            Cairn runs on third-party infrastructure: a managed MongoDB database, an application
            host, a static web host, Cloudinary for files, and a transactional email provider for
            verification and notification mail. Google is involved only if you choose Google
            sign-in.
          </p>
          <p>
            The named, contracted list of these processors is part of what is pending review — see
            the notice at the top of this page.
          </p>
        </LegalSection>

        <LegalSection id="retention" title="How long we keep it">
          <p>
            Account and application records are kept while your account exists. Short-lived
            security records — one-time codes, password reset tokens, refresh sessions — expire on
            their own, in minutes or days rather than indefinitely.
          </p>
          <p>
            An employer account that is denied or suspended is retained rather than deleted,
            because the record is the evidence the address was reviewed.
          </p>
        </LegalSection>

        <LegalSection id="your-rights" title="Your choices">
          <p>
            You can correct your profile at any time from{" "}
            <Link to="/profile" className="text-signal-text hover:underline">
              your profile
            </Link>
            . Account deletion is not yet self-service — this is stated plainly rather than
            implied, and until it ships,{" "}
            <Link to="/contact" className="text-signal-text hover:underline">
              ask us
            </Link>{" "}
            and it will be done by hand.
          </p>
        </LegalSection>

        <LegalSection id="contact" title="Reaching us">
          <p>
            Questions about this policy, or a request about your own data, go through{" "}
            <Link to="/contact" className="text-signal-text hover:underline">
              the contact page
            </Link>
            .
          </p>
        </LegalSection>
      </div>
    </PageShell>
  );
}
