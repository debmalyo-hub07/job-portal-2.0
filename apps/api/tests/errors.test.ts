import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppError } from "../src/lib/AppError.js";
import { errorHandler } from "../src/middleware/error.js";

function appWith(handler: express.RequestHandler): express.Express {
  const app = express();
  app.get("/boom", handler);
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("renders an AppError with its status and code", async () => {
    const res = await request(
      appWith(() => {
        throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
      }),
    ).get("/boom");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      code: "JOB_NOT_FOUND",
      message: "Job not found",
    });
  });

  it("catches a rejected async handler without the request hanging", async () => {
    const res = await request(
      appWith(async () => {
        throw AppError.badRequest("BAD_INPUT", "Bad input");
      }),
    ).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_INPUT");
  });

  it("masks an unexpected error as a generic 500", async () => {
    const res = await request(
      appWith(() => {
        throw new Error("connection string leaked here");
      }),
    ).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("connection string leaked here");
  });

  it("carries validation details through", async () => {
    const res = await request(
      appWith(() => {
        throw AppError.badRequest("VALIDATION_FAILED", "Validation failed", [
          { path: "email", message: "Invalid email" },
        ]);
      }),
    ).get("/boom");

    expect(res.body.details).toEqual([{ path: "email", message: "Invalid email" }]);
  });
});
