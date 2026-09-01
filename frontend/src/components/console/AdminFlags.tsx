import { Loader2 } from "lucide-react";

import AdminShell from "./AdminShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminFlags, useSetFlag } from "@/hooks/useAdminConsole";

/**
 * The console's flag surface — P3 of the console automation program.
 *
 * A control surface, not a settings page: the registry holds a handful of
 * flags at most, every row is one global kill switch, and the last flipper is
 * named because a switch nobody can attribute is a switch nobody trusts.
 */
export function AdminFlags() {
  const flags = useAdminFlags();
  const setFlag = useSetFlag();

  return (
    <AdminShell
      title="Feature flags"
      description="Platform-wide switches. Changes apply within seconds."
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
        <Skeleton className="h-24 rounded-surface" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Last changed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.data.map((flag) => (
              <TableRow key={flag.key}>
                <TableCell className="max-w-md">
                  <p className="font-mono text-sm font-medium text-ink">{flag.key}</p>
                  <p className="mt-1 text-xs text-ink-muted">{flag.description}</p>
                </TableCell>
                <TableCell>
                  <Button
                    variant={flag.enabled ? "signal" : "outline"}
                    size="sm"
                    aria-pressed={flag.enabled}
                    disabled={setFlag.isPending}
                    onClick={() => setFlag.mutate({ key: flag.key, enabled: !flag.enabled })}
                  >
                    {setFlag.isPending ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : null}
                    {flag.enabled ? "On" : "Turn on"}
                  </Button>
                </TableCell>
                <TableCell className="text-xs text-ink-muted">
                  {flag.lastChangedBy && flag.lastChangedAt
                    ? `${flag.lastChangedBy}, ${new Date(flag.lastChangedAt).toLocaleString()}`
                    : "Never changed (registry default)"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminShell>
  );
}

export default AdminFlags;
