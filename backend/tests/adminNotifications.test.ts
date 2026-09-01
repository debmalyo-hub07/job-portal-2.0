import { describe, expect, it } from "vitest";

import { renderAdminPendingEmail } from "../src/lib/emailTemplates.js";

const URL = "https://job-portal-debmalyo.vercel.app/admin/recruiters";

describe("renderAdminPendingEmail", () => {
  it("names the recruiter, the queue size, and the console link", () => {
    const r = renderAdminPendingEmail("Mira Patel", "mira@northstar.test", 3, URL);

    expect(r.subject).toBe("New recruiter waiting for review");
    expect(r.text).toContain("Mira Patel");
    expect(r.text).toContain("mira@northstar.test");
    expect(r.text).toContain("3 recruiters");
    expect(r.text).toContain(URL);
  });

  it("uses the singular for a queue of one", () => {
    const r = renderAdminPendingEmail("Mira Patel", "mira@northstar.test", 1, URL);

    expect(r.text).toContain("is 1 recruiter");
  });

  it("escapes a hostile name at the point of interpolation", () => {
    // The denial-reason rule: free text a human typed is escaped where it
    // lands, not trusted because "a user wrote it".
    const r = renderAdminPendingEmail('<script>alert("x")</script>', "x@y.test", 1, URL);

    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
});
