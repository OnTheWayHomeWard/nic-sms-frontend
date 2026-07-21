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
import { groupsApi } from "@/lib/services";
import type { ApiGroup } from "@/lib/services";

type SortDir = "asc" | "desc";
type SortField = "name" | "file" | "records" | "uploadedby" | "date";

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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function ContactLists() {
  const navigate = useNavigate();
  const [data, setData]         = React.useState<ApiGroup[]>([]);
  const [loading, setLoading]   = React.useState(true);
  const [sortField, setSortField] = React.useState<SortField | null>(null);
  const [sortDir, setSortDir]   = React.useState<SortDir>("asc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [pageKey, setPageKey]   = React.useState(0);

  React.useEffect(() => {
    groupsApi
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
      if (sortField === "name")       { av = a.name; bv = b.name; }
      if (sortField === "file")       { av = a.originalFileName ?? ""; bv = b.originalFileName ?? ""; }
      if (sortField === "records")    { av = a.memberCount; bv = b.memberCount; }
      if (sortField === "uploadedby") { av = a.uploadedByName ?? ""; bv = b.uploadedByName ?? ""; }
      if (sortField === "date")       { av = a.uploadDate ?? ""; bv = b.uploadDate ?? ""; }
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
        <CardTitle className="text-base font-semibold">Contact Lists</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <Table pagination={pagination}>
          <TableHeader>
            <TableRow>
              <SortableHead field="name" sortField={sortField} onSort={handleSort}>
                Group Name
              </SortableHead>
              <SortableHead field="file" sortField={sortField} onSort={handleSort}>
                File Name
              </SortableHead>
              <SortableHead field="records" sortField={sortField} onSort={handleSort}>
                Records
              </SortableHead>
              <SortableHead field="uploadedby" sortField={sortField} onSort={handleSort}>
                Uploaded By
              </SortableHead>
              <SortableHead field="date" sortField={sortField} onSort={handleSort}>
                Upload Date
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
                  No contact lists found.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="font-mono text-xs">{g.originalFileName ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{g.memberCount.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{g.uploadedByName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{fmtDate(g.uploadDate)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex justify-center py-3">
          <Button
            variant="ghost"
            className="h-auto p-0 text-sm gap-1 hover:bg-transparent hover:underline hover:underline-offset-2 cursor-pointer"
            onClick={() => navigate("/contacts")}
          >
            Manage Contacts
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
