import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { buildApp } from "../src/app.js";
import { asSession, signedUpOn, installCaptureMailer } from "./auth/helpers.js";
import { Seeker } from "../src/models/seeker.model.js";
import * as smsTransport from "../src/services/smsTransport.js";

/**
 * The dormant phone-verification machinery (P3): the routes exist only when
 * an SMS provider key does, and the OTP flow behind them is the same shape as
 * every other purpose. The transport is spied — it is the one piece the
 * activation PR writes — so these tests pin everything else: the mount gate,
 * the purpose, the redemption, and `phoneVerifiedAt`.
 */
describe("phone verification (dormant)", () => {
  beforeEach(() => {
    installCaptureMailer();
    vi.restoreAllMocks();
    delete process.env.SMS_PROVIDER_KEY;
  });

  afterEach(() => {
    delete process.env.SMS_PROVIDER_KEY;
  });

  it("does not exist without a provider key — the paths 404", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/v1/user/phone-verification/send").send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  describe("with a provider key", () => {
    let app: ReturnType<typeof buildApp>;
    let sendSms: MockInstance<(to: string, body: string) => Promise<void>>;

    beforeEach(() => {
      process.env.SMS_PROVIDER_KEY = "test-key";
      app = buildApp();
      sendSms = vi.spyOn(smsTransport, "sendSms").mockResolvedValue(undefined);
    });

    it("refuses to send when the profile has no phone", async () => {
      const seeker = await signedUpOn("seeker", "nophone@x.test");
      const res = await request(app)
        .post("/api/v1/user/phone-verification/send")
        .use(asSession("seeker", seeker))
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("PHONE_MISSING");
    });

    it("sends a code to the profile's phone and verifies it", async () => {
      const seeker = await signedUpOn("seeker", "phone@x.test");
      await Seeker.findByIdAndUpdate(seeker.id, { phone: "+919876543210" });

      const sent = await request(app)
        .post("/api/v1/user/phone-verification/send")
        .use(asSession("seeker", seeker))
        .send({});
      expect(sent.status).toBe(200);
      // `issueOtp` dispatches the delivery without awaiting it, so the send
      // lands a beat after the response — wait for the transport.
      await vi.waitFor(() => expect(sendSms).toHaveBeenCalled());
      expect(sendSms).toHaveBeenCalledWith("+919876543210", expect.stringMatching(/\d{6}/));

      // The code travels in the SMS body — the deterministic format is the
      // contract that makes the flow testable end to end.
      const body = sendSms.mock.calls[0]![1];
      const code = body.match(/(\d{6})/)![1]!;
      const wrongCode = code === "000000" ? "000001" : "000000";

      const wrong = await request(app)
        .post("/api/v1/user/phone-verification/confirm")
        .use(asSession("seeker", seeker))
        .send({ code: wrongCode });
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe("OTP_INVALID");

      const confirmed = await request(app)
        .post("/api/v1/user/phone-verification/confirm")
        .use(asSession("seeker", seeker))
        .send({ code });
      expect(confirmed.status).toBe(200);

      const stored = await Seeker.findById(seeker.id);
      expect(stored?.phoneVerifiedAt).toBeInstanceOf(Date);
    });
  });
});
