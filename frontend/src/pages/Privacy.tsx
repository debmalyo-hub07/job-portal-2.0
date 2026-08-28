import { Link } from "react-router";

import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";
import { LegalSection } from "@/components/legal/LegalSection";

const SECTIONS = [
  { id: "scope", title: "Scope" },
  { id: "what-we-collect", title: "What we collect" },
  { id: "how-we-use", title: "How we use it" },
  { id: "resumes", title: "Resumes & files" },
  { id: "who-sees-it", title: "Who sees it" },
  { id: "cookies", title: "Cookies" },
  { id: "processors", title: "Service providers" },
  { id: "retention", title: "Retention" },
  { id: "security", title: "Security" },
  { id: "your-rights", title: "Your choices" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
] as const;

export default function Privacy() {
  return (
    <LegalDocumentLayout
      title="Privacy policy"
      description="What Cairn collects, why the platform needs it, who can see it, and the controls available to you."
      updated="14 August 2026"
      noticePage="privacy policy"
      sections={[...SECTIONS]}
    >
      <LegalSection id="scope" title="Scope">
        <p>
          This policy covers the Cairn website, candidate portal, employer workspace, administrator console, authentication emails, and the API that supports them. It applies to candidates, recruiters, administrators, and visitors who browse without an account.
        </p>
      </LegalSection>

      <LegalSection id="what-we-collect" title="What we collect">
        <p>
          <strong>Account information:</strong> full name, email address, optional phone number, date of birth, optional gender, account portal, verification state, and an optional profile image supplied through Google sign-in. Passwords are stored only as Argon2 hashes, never as recoverable text.
        </p>
        <p>
          <strong>Guardian information (candidates aged 16-17):</strong> a guardian's email address and the time their confirmation code was redeemed. The code itself is stored only as a hash and expires; no guardian identity document is collected. Until the candidate turns 18, their account can apply to internship roles only.
        </p>
        <p>
          <strong>Candidate information:</strong> optional headline, biography, skills, experience, location, salary preferences, remote-work preference, and a resume. An application records the job, status, and application time.
        </p>
        <p>
          <strong>Employer information:</strong> account contact details, company name and profile information, posted jobs, and applicant decisions. Recruiter accounts also carry an approval status.
        </p>
        <p>
          <strong>Operational information:</strong> IP address, browser user agent, request path, request identifier, and security events required for logging, abuse prevention, session management, and fault diagnosis.
        </p>
      </LegalSection>

      <LegalSection id="how-we-use" title="How we use information">
        <p>
          Cairn uses account data to authenticate you, verify mailbox control, recover access, maintain sessions, route you to the correct portal, and enforce portal-specific permissions.
        </p>
        <p>
          Candidate profile preferences are used to calculate and explain job fit. Employer data is used to publish and attribute jobs, operate the hiring workspace, and let administrators review recruiter accounts and marketplace content.
        </p>
        <p>Cairn does not sell personal information and does not run third-party advertising trackers.</p>
      </LegalSection>

      <LegalSection id="resumes" title="Resumes and files">
        <p>
          Resumes are uploaded to Cloudinary as authenticated assets rather than public URLs. Cairn stores the storage identifier and file metadata. When an authorised employer opens a resume, the API creates a signed URL valid for roughly 10 minutes.
        </p>
        <p>
          The employer must own the job associated with the application. An employer cannot use the platform to browse candidate resumes outside applications to its own roles.
        </p>
      </LegalSection>

      <LegalSection id="who-sees-it" title="Who can see your information">
        <p>
          Jobs and company details intended for the public board can be seen by any visitor. Candidate profiles are not public. When a candidate applies, the owning employer can see the applicant name, email, phone number, headline, skills, resume link, application state, and fit explanation for that role.
        </p>
        <p>
          Administrators can review recruiter identity and status, jobs, companies, ownership, and marketplace counts. Routine console responses do not expose candidate contact details.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and local storage">
        <p>
          Cairn uses strictly necessary access, refresh, and CSRF cookies. Access and refresh cookies are <code>httpOnly</code>; browser JavaScript cannot read them. The CSRF token is integrity-protected and echoed by the client on write requests.
        </p>
        <p>
          The web app also stores interface preferences such as theme and a portal hint in local storage. These do not grant access; the API verifies the signed session for every protected request.
        </p>
      </LegalSection>

      <LegalSection id="processors" title="Service providers">
        <p>
          Cairn relies on a managed MongoDB database, an API host, a static web host, Cloudinary for private file storage, Brevo for transactional email, and Google when you choose Google sign-in. Each provider processes only the information needed for its role.
        </p>
        <p>The contracted, named sub-processor schedule remains pending legal review and will replace this summary before public launch.</p>
      </LegalSection>

      <LegalSection id="retention" title="How long information is kept">
        <p>
          Verified accounts, company records, jobs, and applications are retained while needed to provide the service and maintain its operational history. Unverified new accounts are automatically removed after the configured expiry period.
        </p>
        <p>
          One-time codes, lockout budgets, access tokens, refresh sessions, signed file URLs, and Google linking transactions expire in minutes, hours, or days. Denied or suspended recruiter records may be retained as moderation evidence.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security measures">
        <p>
          Cairn separates candidate, recruiter, and administrator accounts into distinct collections and cryptographic portal keys. Protected writes use CSRF verification, authentication endpoints are rate-limited, password reset revokes active sessions, and administrator self-registration does not exist.
        </p>
        <p>
          No internet service can promise absolute security. If you believe an account or listing has been misused, use the <Link to="/contact" className="text-signal-text hover:underline">privacy and safety contact channel</Link> promptly.
        </p>
      </LegalSection>

      <LegalSection id="your-rights" title="Your choices and requests">
        <p>
          Candidates can correct profile information from the protected profile page. You may ask for access, correction, deletion, or another privacy request through the contact page. Account deletion is not yet self-service and is handled manually.
        </p>
        <p>
          Google sign-in is optional. You can use password authentication instead, and administrator accounts cannot use Google sign-in at all.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          Cairn will update this policy when product behaviour, service providers, legal obligations, or operating details change. Material changes will be announced on the site and reflected in the date at the top of this document.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Privacy questions and requests should use the <Link to="/contact" className="text-signal-text hover:underline">contact page</Link> and the privacy and safety channel.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
