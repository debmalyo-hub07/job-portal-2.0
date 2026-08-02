import mongoose, { type Model, type Schema } from "mongoose";

/**
 * Registers a model, reusing an existing registration if there is one.
 *
 * `mongoose.model(name, schema)` throws OverwriteModelError on a second call
 * with the same name, and that is reachable in the test suite through no fault
 * of the tests. Vitest gives each test FILE its own module registry, but
 * `mongoose` itself is a single cached instance for the whole process — so a
 * model file imported by two test files is evaluated twice against one registry
 * and the second evaluation throws.
 *
 * It stayed invisible until Phase 1B because no two test files had ever imported
 * the same model. The failure is also badly misleading: it surfaces as a whole
 * suite failing to LOAD, pointing at a model file nobody touched, in a test file
 * that was green a moment ago.
 *
 * `mongoose.models[name]` is the registry itself, so this is idempotent by
 * construction rather than by catching the error after the fact.
 */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}
