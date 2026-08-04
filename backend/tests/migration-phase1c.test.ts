import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import {
  dropGlobalCompanyNameIndex,
  dropLegacyUsersCollection,
} from "../src/scripts/migrate-phase1c.js";
import { Company } from "../src/models/company.model.js";

describe("phase 1C migration", () => {
  it("drops the users collection when present and is a no-op when absent", async () => {
    await mongoose.connection.db!.collection("users").insertOne({ legacy: true });
    expect((await dropLegacyUsersCollection()).dropped).toBe(true);

    const names = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
    expect(names).not.toContain("users");

    // Idempotent: the script is safe to run twice, which is how it will be run.
    expect((await dropLegacyUsersCollection()).dropped).toBe(false);
  });

  it("drops a pre-1C global company name index and is a no-op without one", async () => {
    await Company.init();
    await Company.collection.createIndex({ name: 1 }, { unique: true, name: "name_1" });
    expect((await dropGlobalCompanyNameIndex()).dropped).toBe(true);

    const remaining = (await Company.collection.indexes()).map((i) => i.name);
    expect(remaining).not.toContain("name_1");

    expect((await dropGlobalCompanyNameIndex()).dropped).toBe(false);
  });
});
