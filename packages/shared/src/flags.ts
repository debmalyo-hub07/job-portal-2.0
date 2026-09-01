import { z } from "zod";

/**
 * The platform's feature flags — P3 of the console automation program.
 *
 * Defined in code, overridden in the database: the registry is the source of
 * truth for what exists (a typo is a compile error, a default ships in the PR
 * that introduces the behavior), and the `FeatureFlag` collection stores only
 * deviations — no row means the registry default. A global on/off per flag,
 * nothing finer: this is an operator's kill switch, not an experiment
 * platform (ADR-0009).
 */
export const FLAG_REGISTRY = [
  {
    key: "autoApproveRecruiterSignups",
    description:
      "Reserved for the approval automation: when on, recruiter signups that pass every strong signal are approved without a human review. Inert until that ships — leave off.",
    default: false,
  },
] as const satisfies readonly { key: string; description: string; default: boolean }[];

export type FlagKey = (typeof FLAG_REGISTRY)[number]["key"];

export const FLAG_KEYS: readonly FlagKey[] = FLAG_REGISTRY.map((flag) => flag.key);

/** The resolved value when no override row exists. */
export function flagDefault(key: FlagKey): boolean {
  return FLAG_REGISTRY.find((flag) => flag.key === key)?.default ?? false;
}

/** Route-param validation: an unregistered key is a 400, never a new flag. */
export const flagKeySchema = z.enum(FLAG_KEYS as [FlagKey, ...FlagKey[]]);

export const setFlagBodySchema = z.object({ enabled: z.boolean() });
export type SetFlagBody = z.infer<typeof setFlagBodySchema>;

/**
 * The console's read: every registry flag with its resolved value, plus —
 * where a row exists — who last flipped it and when.
 */
export type AdminFlagDto = {
  key: FlagKey;
  description: string;
  enabled: boolean;
  default: boolean;
  lastChangedBy: string | null;
  lastChangedAt: string | null;
};

/** The public read: resolved values only. Flag state is not a secret. */
export type FlagsResponse = {
  flags: Partial<Record<FlagKey, boolean>>;
};
