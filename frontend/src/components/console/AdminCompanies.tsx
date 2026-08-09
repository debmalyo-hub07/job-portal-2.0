import { Building2 } from "lucide-react";

import AdminShell from "./AdminShell";
import { ListControls, Pager } from "./ListControls";
import { EmptyState } from "@/components/layout/EmptyState";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminCompanies } from "@/hooks/useAdminConsole";

/**
 * Every company on the platform with its owner and job count.
 *
 * `AvatarFallback` is not optional here: most companies have no logo, and an
 * `AvatarImage` with an undefined `src` renders nothing at all — the same bug
 * 2B-1 fixed in the account menu, where it made the popover trigger invisible.
 */
export function AdminCompanies() {
  const { data, isPending, isError, error, keyword, setKeyword, setPage } = useAdminCompanies();

  return (
    <AdminShell title="Companies" description="Every company registered by a recruiter.">
      <ListControls label="Search companies" keyword={keyword} onKeyword={setKeyword}>
        {data ? (
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        ) : null}
      </ListControls>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-surface" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-danger">
          Could not load companies: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={keyword ? "No companies match that search" : "No companies yet"}
          description={
            keyword
              ? "Try a different name or location."
              : "A company appears here once an approved recruiter creates one."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Jobs</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((company) => (
                <TableRow key={company.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={company.logoUrl ?? undefined} alt="" />
                        <AvatarFallback>{company.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{company.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{company.ownerEmail ?? "—"}</TableCell>
                  <TableCell>{company.location ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{company.jobCount}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {company.createdAt.split("T")[0]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminShell>
  );
}

export default AdminCompanies;
