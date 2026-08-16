import { Building2, Edit2, MoreHorizontal, Plus } from "lucide-react";
import { useNavigate } from "react-router";

import HireShell from "./HireShell";
import { ListControls } from "@/components/layout/ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import CompanyAvatar from "@/components/shared/CompanyAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOwnedCompanies } from "@/hooks/useRecruiterWorkspace";

/**
 * The recruiter's own companies.
 *
 * The filter is client-side and says so: `GET /company/get` returns every owned
 * company as a plain array with no pagination, so there is no page to be
 * out of step with. That is the one case where filtering in the browser is
 * honest, and the label reads "Filter companies" rather than "Search" to keep
 * the distinction visible. If that endpoint ever paginates, this has to become
 * a server parameter the same day — see `useOwnedJobs`.
 *
 * `AvatarFallback` is not optional: `logoUrl` is null for most companies and an
 * `AvatarImage` with an undefined `src` renders nothing at all. The inherited
 * table had no fallback, so its logo column was a row of blank circles.
 */
export function WorkspaceCompanies() {
  const navigate = useNavigate();
  const { filtered, isPending, isError, error, keyword, setKeyword } = useOwnedCompanies();

  return (
    <HireShell
      title="Companies"
      description="Organisations you post under."
      actions={
        <Button variant="signal" onClick={() => navigate("/hire/companies/create")}>
          <Plus data-icon="inline-start" />
          New company
        </Button>
      }
    >
      <ListControls label="Filter companies" keyword={keyword} onKeyword={setKeyword} />

      {isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load your companies:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={keyword ? "No companies match that filter" : "No companies yet"}
          description={
            keyword
              ? "Try a different name."
              : "Register a company before posting your first role."
          }
          action={
            keyword ? undefined : (
              <Button onClick={() => navigate("/hire/companies/create")}>New company</Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-surface border border-line bg-paper-raised shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <CompanyAvatar name={company.name} logoUrl={company.logoUrl} className="size-8" />
                      <span className="font-medium">{company.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{company.location ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {company.createdAt.split("T")[0]}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Actions for ${company.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => navigate(`/hire/companies/${company.id}`)}
                        >
                          <Edit2 />
                          Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </HireShell>
  );
}

export default WorkspaceCompanies;
