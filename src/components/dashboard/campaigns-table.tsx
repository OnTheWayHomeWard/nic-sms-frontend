"use client";

import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/tablePagination";
import { Skeleton } from "@/components/ui/skeleton";
import { campaignsApi, workspacesApi } from "@/lib/services";
import type { ApiCampaign, ApiWorkspace } from "@/lib/services";
import { useAuth } from "@/contexts/AuthContext";
import { atLeast } from "@/lib/permissions";

type SortDir = "asc" | "desc";
type SortField = "campaign" | "workspace" | "date" | "total" | "delivered" | "failed" | "status";

const STATUS_CLASS: Record<string, string> = {
  COMPLETED:        "border-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  QUEUED:           "border-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  APPROVED:         "border-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  PENDING_APPROVAL: "border-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  PENDING_HEAD:     "border-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  PENDING_CEO:      "border-0 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  DRAFT:            "border-0 bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  CANCELLED:        "border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED:        "Completed",
  QUEUED:           "Queued",
  APPROVED:         "Approved",
  PENDING_APPROVAL: "Pending Approval",
  PENDING_HEAD:     "Pending Head",
  PENDING_CEO:      "Pending Delegate",
  DRAFT:            "Draft",
  CANCELLED:        "Cancelled",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function SortableHead({
  children,
  field,
  sortField,
  onSort,
  className,
}: {
  children: React.ReactNode;
  field: SortField;
  sortField: SortField | null;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-left hover:text-foreground transition-colors"
      >
        {children}
        <ArrowUpDown
          className={`size-3.5 ${sortField === field ? "text-foreground" : "text-muted-foreground"}`}
        />
      </button>
    </TableHead>
  );
}

export default function CampaignsTable() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = atLeast(user?.role, "SUPER_ADMIN");

  const [campaigns, setCampaigns]   = React.useState<ApiCampaign[]>([]);
  const [wsMap, setWsMap]           = React.useState<Map<string, string>>(new Map());
  const [loading, setLoading]       = React.useState(true);
  const [sortField, setSortField]   = React.useState<SortField | null>(null);
  const [sortDir, setSortDir]       = React.useState<SortDir>("asc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [pageKey, setPageKey]       = React.useState(0);

  React.useEffect(() => {
    const tasks: Promise<unknown>[] = [
      campaignsApi.list().then(setCampaigns).catch(() => {}),
    ];
    if (isSuperAdmin) {
      tasks.push(
        workspacesApi.list().then((wsList: ApiWorkspace[]) => {
          setWsMap(new Map(wsList.map((ws) => [ws.id, ws.name])));
        }).catch(() => {})
      );
    }
    Promise.all(tasks).finally(() => setLoading(false));
  }, [isSuperAdmin]);

  const sortedData = React.useMemo(() => {
    if (!sortField) return [...campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...campaigns].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "campaign")  { av = a.name; bv = b.name; }
      if (sortField === "workspace") { av = wsMap.get(a.workspaceId) ?? ""; bv = wsMap.get(b.workspaceId) ?? ""; }
      if (sortField === "date")      { av = a.createdAt; bv = b.createdAt; }
      if (sortField === "total")     { av = a.totalMessages; bv = b.totalMessages; }
      if (sortField === "delivered") { av = a.deliveredMessages; bv = b.deliveredMessages; }
      if (sortField === "failed")    { av = a.failedMessages; bv = b.failedMessages; }
      if (sortField === "status")    { av = a.status; bv = b.status; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [campaigns, sortField, sortDir, wsMap]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / rowsPerPage));
  const safePage   = Math.min(currentPage, totalPages);
  const start      = (safePage - 1) * rowsPerPage;
  const paginated  = sortedData.slice(start, start + rowsPerPage);

  function goToPage(page: number) {
    const next = Math.max(1, Math.min(totalPages, page));
    if (next === safePage) return;
    setCurrentPage(next);
    setPageKey((k) => k + 1);
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 text-sm">
      <span className="text-muted-foreground">{sortedData.length} result(s)</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground whitespace-nowrap">Rows per page</span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}
        >
          <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[5, 10, 20].map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground whitespace-nowrap mr-1">
          Page {safePage} of {totalPages}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(1)} disabled={safePage === 1}>
          <ChevronsLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(safePage - 1)} disabled={safePage === 1}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(totalPages)} disabled={safePage === totalPages}>
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );

  const colSpan = isSuperAdmin ? 7 : 6;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">All Campaigns</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <Table pagination={pagination}>
          <TableHeader>
            <TableRow>
              <SortableHead field="campaign" sortField={sortField} onSort={handleSort}>
                Campaign
              </SortableHead>
              {isSuperAdmin && (
                <SortableHead field="workspace" sortField={sortField} onSort={handleSort}>
                  Workspace
                </SortableHead>
              )}
              <SortableHead field="date" sortField={sortField} onSort={handleSort}>
                Date
              </SortableHead>
              <SortableHead field="total" sortField={sortField} onSort={handleSort}>
                Total
              </SortableHead>
              <SortableHead field="delivered" sortField={sortField} onSort={handleSort}>
                Delivered
              </SortableHead>
              <SortableHead field="failed" sortField={sortField} onSort={handleSort}>
                Failed
              </SortableHead>
              <SortableHead field="status" sortField={sortField} onSort={handleSort} className="w-32">
                Status
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody key={pageKey} className="animate-in fade-in duration-200">
            {loading ? (
              Array.from({ length: 7 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colSpan }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-12 text-muted-foreground">
                  No campaigns found.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  {isSuperAdmin && (
                    <TableCell className="text-xs text-muted-foreground">
                      {wsMap.get(c.workspaceId) ?? c.workspaceId.slice(0, 8)}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground tabular-nums">
                    {fmtDate(c.createdAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">{c.totalMessages.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{c.deliveredMessages.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{c.failedMessages.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CLASS[c.status] ?? "border-0 bg-neutral-100 text-neutral-600"}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex justify-center py-3">
          <Button
            variant="ghost"
            className="h-auto p-0 text-sm gap-1 hover:bg-transparent hover:underline hover:underline-offset-2 cursor-pointer"
            onClick={() => navigate("/campaigns")}
          >
            View All Campaigns
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
