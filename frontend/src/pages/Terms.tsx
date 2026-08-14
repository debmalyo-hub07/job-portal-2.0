import { Link } from "react-router";

import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";
import { LegalSection } from "@/components/legal/LegalSection";

const SECTIONS = [
  { id: "accepting", title: "Accepting the terms" },
  { id: "service", title: "The service" },
  { id: "eligibility", title: "Eligibility" },
  { id: "accounts", title: "Accounts & security" },
  { id: "employers", title: "Employer obligations" },
  { id: "candidates", title: "Candidate obligations" },
  { id: "content", title: "Content & permissions" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "moderation", title: "Moderation" },
  { id: "availability", title: "Availability" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Liability" },
  { id: "termination", title: "Termination" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
] as const;

export default function Terms() {
  return (
    <LegalDocumentLayout
      title="Terms of service"
      description="The conditions for browsing, applying, hiring, administering, and contributing content through Cairn."
      updated="14 August 2026"
      noticePage="terms of service"
      sections={[...SECTIONS]}
    >
      <LegalSection id="accepting" title="Accepting these terms">
        <p>
          By creating an account or using a protected Cairn workflow, you agree to these terms. If you create an employer account or act for an organisation, you confirm that you have authority to accept them for that organisation.
        </p>
      </LegalSection>

      <LegalSection id="service" title="What Cairn provides">
        <p>
          Cairn provides a public job board, candidate profiles and applications, an approved employer workspace, and an administrator console for recruiter and marketplace oversight. Cairn is not an employer, recruitment agency, or party to an employment agreement.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" title="Eligibility">
        <p>
          You must be legally able to form a contract in your jurisdiction. Employer users must be authorised to represent the company named in their workspace. Administrator access is invitation-only and must be used solely for platform operations.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="Accounts and security">
        <p>
          Provide accurate account information, protect your password and one-time codes, and keep your email address accessible. You are responsible for activity under your account unless you promptly report unauthorised access.
        </p>
        <p>
          Do not share administrator sessions or provisioning keys. Additional administrators may be invited only by an authenticated administrator using the private provisioning control maintained by the platform owner.
        </p>
      </LegalSection>

      <LegalSection id="employers" title="Employer obligations">
        <p>
          Employer accounts begin pending and may be approved, denied, or suspended. A listing must describe a genuine opening and must accurately represent the role, location, remote status, compensation, experience expectation, and organisation.
        </p>
        <p>
          Use applicant information only to evaluate the application to the role for which it was submitted. Do not resell, scrape, publish, or use candidate data for unrelated marketing or recruiting campaigns.
        </p>
      </LegalSection>

      <LegalSection id="candidates" title="Candidate obligations">
        <p>
          Submit information that is materially accurate and belongs to you. Do not impersonate another person, misrepresent qualifications, automate bulk applications, or upload files containing malicious code.
        </p>
        <p>
          Applying intentionally discloses the relevant candidate profile and resume to the employer that owns the selected job. Review the listing and your file before submitting.
        </p>
      </LegalSection>

      <LegalSection id="content" title="Content and permissions">
        <p>
          You keep ownership of content you submit. You grant Cairn the limited permission needed to store, process, display, and transmit that content to operate the relevant workflow, including showing a public job or delivering an application to its employer.
        </p>
        <p>
          You confirm that you have the right to submit the content and that it does not violate law, confidentiality, privacy, intellectual property, or another person's rights.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="Acceptable use">
        <p>
          Do not break, overload, probe, reverse engineer, scrape, bypass rate limits, forge sessions, defeat portal boundaries, access another user's data, distribute malware, or use Cairn for spam, discrimination, fraud, surveillance, or unlawful activity.
        </p>
      </LegalSection>

      <LegalSection id="moderation" title="Review and moderation">
        <p>
          Cairn may review recruiter accounts, companies, jobs, applications, and security events to operate the service and enforce these terms. Listings may be removed and accounts may be denied or suspended where identity, legitimacy, safety, or compliance cannot be established.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="Changes and availability">
        <p>
          Cairn may add, change, pause, or remove functionality. Early-stage workflows may require manual support, and features described as unavailable in the FAQ are not promised by these terms.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" title="Disclaimers">
        <p>
          The service is provided "as is" and "as available" to the extent permitted by law. Cairn does not guarantee that a listing is accurate, that an employer will respond, that a candidate will be suitable, or that using the service will result in an interview or hire.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="Limitation of liability">
        <p>
          To the extent permitted by law, Cairn is not liable for indirect, incidental, special, consequential, or lost-opportunity damages arising from use of the service, marketplace content, another user's conduct, or a hiring decision.
        </p>
        <p>The final liability cap and any jurisdiction-specific exclusions remain subject to legal review.</p>
      </LegalSection>

      <LegalSection id="termination" title="Suspension and termination">
        <p>
          You may stop using Cairn at any time. Cairn may restrict, suspend, or terminate access for a violation, security risk, legal requirement, or misuse. Closing access does not require immediate deletion of records that must be retained for security, moderation, legal, or operational reasons.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to these terms">
        <p>
          Material revisions will be announced on the site and reflected in the date above. Continued use after the effective date means you accept the revised terms where the law permits that approach.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Questions">
        <p>
          Questions about these terms can be sent through the <Link to="/contact" className="text-signal-text hover:underline">contact page</Link>.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
