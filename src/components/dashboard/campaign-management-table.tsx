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
import { campaignsApi } from "@/lib/services";
import type { ApiCampaign } from "@/lib/services";

type SortDir = "asc" | "desc";
type SortField = "campaign" | "date" | "scheduled" | "messages";

const PENDING_STATUSES = new Set(["PENDING_APPROVAL", "PENDING_HEAD", "PENDING_CEO"]);

const STATUS_CLASS: Record<string, string> = {
  PENDING_APPROVAL: "border-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  PENDING_HEAD:     "border-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  PENDING_CEO:      "border-0 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pending Approval",
  PENDING_HEAD:     "Pending Head",
  PENDING_CEO:      "Pending Delegate",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtScheduled(iso: string | null) {
  if (!iso) return "Instant";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default function CampaignManagementTable() {
  const navigate = useNavigate();
  const [allCampaigns, setAllCampaigns] = React.useState<ApiCampaign[]>([]);
  const [loading, setLoading]   = React.useState(true);
  const [sortField, setSortField] = React.useState<SortField | null>(null);
  const [sortDir, setSortDir]   = React.useState<SortDir>("asc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [pageKey, setPageKey]   = React.useState(0);

  React.useEffect(() => {
    campaignsApi
      .list()
      .then(setAllCampaigns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pendingCampaigns = React.useMemo(
    () => allCampaigns.filter((c) => PENDING_STATUSES.has(c.status)),
    [allCampaigns]
  );

  const sortedData = React.useMemo(() => {
    if (!sortField) return [...pendingCampaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...pendingCampaigns].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "campaign")  { av = a.name; bv = b.name; }
      if (sortField === "date")      { av = a.createdAt; bv = b.createdAt; }
      if (sortField === "scheduled") { av = a.scheduledAt ?? ""; bv = b.scheduledAt ?? ""; }
      if (sortField === "messages")  { av = a.recipientCount ?? 0; bv = b.recipientCount ?? 0; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [pendingCampaigns, sortField, sortDir]);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Campaign Approval</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <Table pagination={pagination}>
          <TableHeader>
            <TableRow>
              <SortableHead field="campaign" sortField={sortField} onSort={handleSort} className="w-62.5">
                Campaign
              </SortableHead>
              <SortableHead field="date" sortField={sortField} onSort={handleSort}>
                Date
              </SortableHead>
              <SortableHead field="scheduled" sortField={sortField} onSort={handleSort}>
                Scheduled
              </SortableHead>
              <SortableHead field="messages" sortField={sortField} onSort={handleSort}>
                Messages
              </SortableHead>
              <TableHead className="w-32 text-left">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody key={pageKey} className="animate-in fade-in duration-200">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No pending campaigns.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {fmtDate(c.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {fmtScheduled(c.scheduledAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {c.recipientCount != null ? c.recipientCount.toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_CLASS[c.status] ?? "border-0 bg-neutral-100 text-neutral-600"}
                    >
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
            Campaign Management
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
