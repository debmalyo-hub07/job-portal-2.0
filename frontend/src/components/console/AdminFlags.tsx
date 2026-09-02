import { AdminShell } from "./AdminShell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAdminFlags, useSetFlag } from "@/hooks/useAdminConsole";

/**
 * The console's flag surface — P3 of the console automation program.
 *
 * A control surface, not a settings page: the registry holds a handful of
 * flags at most, every one is a global kill switch, and the last flipper is
 * named because a switch nobody can attribute is a switch nobody trusts.
 * The card idiom follows from that — one flag is one complete card (badge,
 * key, switch, description, provenance), where the monitoring tables this
 * console uses for records would wrap a single row in a three-column header
 * and call it a list.
 *
 * The switch is deliberately not optimistic: it reads the server's resolved
 * state, and the row updates when the round trip lands. A switch whose state
 * lies about itself until the PUT resolves is worse than one that waits a
 * beat.
 */
export function AdminFlags() {
  const flags = useAdminFlags();
  const setFlag = useSetFlag();

  return (
    <AdminShell
      title="Feature flags"
      description="Platform-wide switches, live within seconds. Every change is recorded."
    >
      {setFlag.isError ? (
        <p role="alert" className="mb-4 text-sm text-danger-text">
          Could not flip that flag:{" "}
          {setFlag.error instanceof Error ? setFlag.error.message : "unknown error"}
        </p>
      ) : null}
      {flags.isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Could not load the flags:{" "}
          {flags.error instanceof Error ? flags.error.message : "unknown error"}
        </p>
      ) : flags.isPending || !flags.data ? (
        <Skeleton className="h-36 rounded-surface" />
      ) : (
        <div className="grid gap-4">
          {flags.data.map((flag) => (
            <section
              key={flag.key}
              aria-label={flag.key}
              className="rounded-surface border border-line bg-paper-raised p-5 shadow-[var(--elevate-1)]"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={flag.enabled ? "ok" : "secondary"}>{flag.enabled ? "On" : "Off"}</Badge>
                <p className="min-w-0 flex-1 font-mono text-sm font-semibold text-ink">{flag.key}</p>
                <Switch
                  aria-label={flag.key}
                  checked={flag.enabled}
                  disabled={setFlag.isPending}
                  onCheckedChange={(next) => setFlag.mutate({ key: flag.key, enabled: next })}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-muted">{flag.description}</p>
              <p className="mt-3 text-xs text-ink-faint">
                {flag.lastChangedBy && flag.lastChangedAt
                  ? `Last changed by ${flag.lastChangedBy} · ${new Date(flag.lastChangedAt).toLocaleString()}`
                  : "Never changed — running the registry default"}
              </p>
            </section>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

export default AdminFlags;
