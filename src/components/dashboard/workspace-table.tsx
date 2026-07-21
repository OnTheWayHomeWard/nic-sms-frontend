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
import { workspacesApi } from "@/lib/services";
import type { ApiWorkspace } from "@/lib/services";

type SortDir = "asc" | "desc";
type SortField = "workspace" | "admin" | "users" | "limit" | "status";

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

export default function WorkspaceTable() {
  const navigate = useNavigate();
  const [data, setData]         = React.useState<ApiWorkspace[]>([]);
  const [loading, setLoading]   = React.useState(true);
  const [sortField, setSortField] = React.useState<SortField | null>(null);
  const [sortDir, setSortDir]   = React.useState<SortDir>("asc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [pageKey, setPageKey]   = React.useState(0);

  React.useEffect(() => {
    workspacesApi
      .list()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sortedData = React.useMemo(() => {
    if (!sortField) return data;
    return [...data].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "workspace") { av = a.name; bv = b.name; }
      if (sortField === "admin")     { av = a.adminName ?? ""; bv = b.adminName ?? ""; }
      if (sortField === "users")     { av = a.memberCount; bv = b.memberCount; }
      if (sortField === "limit")     { av = a.dailySmsLimit ?? 0; bv = b.dailySmsLimit ?? 0; }
      if (sortField === "status")    { av = a.status; bv = b.status; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortField, sortDir]);

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
        <CardTitle className="text-base font-semibold">Workspace Status</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <Table pagination={pagination}>
          <TableHeader>
            <TableRow>
              <SortableHead field="workspace" sortField={sortField} onSort={handleSort}>
                Workspace
              </SortableHead>
              <SortableHead field="admin" sortField={sortField} onSort={handleSort}>
                Admin
              </SortableHead>
              <SortableHead field="users" sortField={sortField} onSort={handleSort}>
                Users
              </SortableHead>
              <SortableHead field="limit" sortField={sortField} onSort={handleSort}>
                Daily Limit
              </SortableHead>
              <SortableHead field="status" sortField={sortField} onSort={handleSort}>
                Status
              </SortableHead>
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
                  No workspaces found.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((ws) => (
                <TableRow key={ws.id}>
                  <TableCell className="font-medium">{ws.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {ws.adminName ?? "—"}
                  </TableCell>
                  <TableCell>{ws.memberCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {ws.dailySmsLimit != null ? ws.dailySmsLimit.toLocaleString() : "Unlimited"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        ws.status === "ACTIVE"
                          ? "border-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                          : "border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      }
                    >
                      {ws.status === "ACTIVE" ? "Active" : "Suspended"}
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
            onClick={() => navigate("/workspaces")}
          >
            Manage Workspaces
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
