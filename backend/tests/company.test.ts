import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }));
vi.mock("../src/utils/cloudinary.js", () => ({
  getCloudinary: () => ({ uploader: { upload: uploadMock } }),
}));

import { buildApp } from "../src/app.js";
import { Company } from "../src/models/company.model.js";
import { asSession, installCaptureMailer, signedUpOn } from "./auth/helpers.js";

const app = buildApp();

async function createCompany(session: Awaited<ReturnType<typeof signedUpOn>>, name = "Acme") {
  return request(app)
    .post("/api/v1/company/register")
    .use(asSession("recruiter", session))
    .send({ name });
}

describe("company routes", () => {
  let owner: Awaited<ReturnType<typeof signedUpOn>>;
  let rival: Awaited<ReturnType<typeof signedUpOn>>;
  let seeker: Awaited<ReturnType<typeof signedUpOn>>;

  beforeEach(async () => {
    installCaptureMailer();
    // The {userId, name} unique index backs the 409; autoIndex builds it
    // asynchronously, so the duplicate test would otherwise race the build.
    await Company.init();
    owner = await signedUpOn("recruiter", "owner@example.com");
    rival = await signedUpOn("recruiter", "rival@example.com");
    seeker = await signedUpOn("seeker", "seeker@example.com");
  });

  it("registers a company and returns a DTO (no Mongoose internals)", async () => {
    const res = await createCompany(owner);
    expect(res.status).toBe(201);
    expect(res.body.company).toMatchObject({ name: "Acme", logoUrl: null });
    expect(res.body.company._id).toBeUndefined();
    expect(res.body.company.__v).toBeUndefined();
    expect(res.body.company.userId).toBeUndefined();
  });

  it("rejects an invalid body with 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/v1/company/register")
      .use(asSession("recruiter", owner))
      .send({ name: "x" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("409s a duplicate name for the same owner but allows it for another recruiter", async () => {
    await createCompany(owner);
    const dup = await createCompany(owner);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("COMPANY_EXISTS");
    expect((await createCompany(rival)).status).toBe(201);
  });

  it("GET /get returns only the caller's companies", async () => {
    await createCompany(owner, "Mine");
    await createCompany(rival, "Theirs");
    const res = await request(app)
      .get("/api/v1/company/get")
      .set("Cookie", [`jp_recruiter_at=${owner.access}`]);
    expect(res.status).toBe(200);
    expect(res.body.companies.map((c: { name: string }) => c.name)).toEqual(["Mine"]);
  });

  // The authorization matrix for GET /get/:id and PUT /update/:id.
  for (const [route, method] of [
    ["get", "get"],
    ["update", "put"],
  ] as const) {
    describe(`${method.toUpperCase()} /${route}/:id matrix`, () => {
      let companyId: string;
      beforeEach(async () => {
        companyId = (await createCompany(owner)).body.company.id;
      });
      const call = (
        actor?: {
          portal: "seeker" | "recruiter";
          session: Awaited<ReturnType<typeof signedUpOn>>;
        },
      ) => {
        const r = request(app)[method](`/api/v1/company/${route}/${companyId}`);
        if (actor) r.use(asSession(actor.portal, actor.session));
        return method === "put" ? r.field("name", "Renamed") : r;
      };
      it("anonymous → 401", async () => expect((await call()).status).toBe(401));
      it("seeker → 401 (wrong portal)", async () =>
        expect((await call({ portal: "seeker", session: seeker })).status).toBe(401));
      it("unrelated recruiter → 404 (no existence oracle)", async () => {
        const res = await call({ portal: "recruiter", session: rival });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("COMPANY_NOT_FOUND");
      });
      it("owner → 200", async () =>
        expect((await call({ portal: "recruiter", session: owner })).status).toBe(200));
    });
  }

  it("update without a file updates fields and keeps the logo untouched", async () => {
    const companyId = (await createCompany(owner)).body.company.id;
    const res = await request(app)
      .put(`/api/v1/company/update/${companyId}`)
      .use(asSession("recruiter", owner))
      .field("description", "We build things");
    expect(res.status).toBe(200);
    expect(res.body.company.description).toBe("We build things");
    expect(res.body.company.logoUrl).toBeNull();
    expect(res.body.company.name).toBe("Acme");
  });

  it("uploads a validated logo to the company-specific Cloudinary path", async () => {
    uploadMock.mockResolvedValueOnce({
      secure_url: "https://res.cloudinary.com/test/image/upload/company-logos/logo.png",
    });
    const companyId = (await createCompany(owner)).body.company.id;
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );

    const res = await request(app)
      .put(`/api/v1/company/update/${companyId}`)
      .use(asSession("recruiter", owner))
      .attach("file", onePixelPng, { filename: "mark.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.company.logoUrl).toContain("company-logos");
    expect(uploadMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        folder: "company-logos",
        overwrite: true,
        invalidate: true,
        resource_type: "image",
        transformation: [
          expect.objectContaining({ width: 512, height: 512, crop: "limit" }),
        ],
      }),
    );
  });

  it("409s an update that renames a company onto the owner's existing name", async () => {
    await createCompany(owner, "Acme");
    const betaId = (await createCompany(owner, "Beta")).body.company.id;
    const res = await request(app)
      .put(`/api/v1/company/update/${betaId}`)
      .use(asSession("recruiter", owner))
      .send({ name: "Acme" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COMPANY_EXISTS");
  });

  it("accepts a plain JSON update body too", async () => {
    const companyId = (await createCompany(owner)).body.company.id;
    const res = await request(app)
      .put(`/api/v1/company/update/${companyId}`)
      .use(asSession("recruiter", owner))
      .send({ location: "Kolkata" });
    expect(res.status).toBe(200);
    expect(res.body.company.location).toBe("Kolkata");
  });

  it("malformed :id → 400, unknown-but-wellformed :id → 404", async () => {
    const c = (cookie: string, id: string) =>
      request(app).get(`/api/v1/company/get/${id}`).set("Cookie", [cookie]);
    expect((await c(`jp_recruiter_at=${owner.access}`, "nope")).status).toBe(400);
    expect((await c(`jp_recruiter_at=${owner.access}`, "64b0c8f2a9d3e45f6a7b8c9d")).status).toBe(404);
  });
});
