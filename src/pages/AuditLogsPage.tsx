"use client";

import * as React from "react";

import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileDown,
  Eye,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Separator } from "@/components/ui/separator";
import { auditLogsApi, type ApiAuditLog } from "@/lib/services";

// ─── Types ─────────────────────────────────────────────

type AuditLevel = "INFO" | "WARN" | "HIGH";

type SortField = "timestamp" | "level" | "actor" | "event" | "resource" | "ip";

type SortDir = "asc" | "desc";

interface AuditLog {
  id: string;
  timestamp: string;
  level: AuditLevel;
  actor: string;
  event: string;
  resource: string;
  ip: string;
}

// ─── Backend mapping ───────────────────────────────────

function fromApi(log: ApiAuditLog): AuditLog {
  const severity = log.severity?.toUpperCase();
  const level: AuditLevel =
    severity === "WARN" ? "WARN" : severity === "HIGH" ? "HIGH" : "INFO";
  return {
    id: log.id,
    timestamp: log.createdAt ? new Date(log.createdAt).toLocaleString() : "—",
    level,
    actor: log.actorUsername ?? "—",
    event: log.action ?? "—",
    resource: log.entityType ?? "—",
    ip: log.ipAddress ?? "—",
  };
}

// ─── Sortable Header ──────────────────────────────────

function SortableHead({
  children,
  field,
  onSort,
  className,
}: {
  children: React.ReactNode;
  field: SortField;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button onClick={() => onSort(field)} className="flex items-center gap-1">
        {children}

        <ArrowUpDown className="size-3.5 text-muted-foreground" />
      </button>
    </TableHead>
  );
}

// ─── Badge ─────────────────────────────────────────────

function LevelBadge({ level }: { level: AuditLevel }) {
  if (level === "INFO") {
    return (
      <span className="inline-flex rounded-md bg-sky-100 px-2 py-1 text-[10px] font-semibold text-sky-600">
        INFO
      </span>
    );
  }

  if (level === "WARN") {
    return (
      <span className="inline-flex rounded-md bg-yellow-100 px-2 py-1 text-[10px] font-semibold text-yellow-600">
        WARN
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-md bg-pink-100 px-2 py-1 text-[10px] font-semibold text-pink-600">
      HIGH
    </span>
  );
}

function exportToJson(logs: AuditLog[], filename = "system_audit_logs.json") {
  const dataStr = JSON.stringify(logs, null, 2);

  const blob = new Blob([dataStr], {
    type: "application/json",
  });

  const downloadUrl = URL.createObjectURL(blob);

  const triggerLink = document.createElement("a");
  triggerLink.href = downloadUrl;
  triggerLink.download = filename;

  document.body.appendChild(triggerLink);
  triggerLink.click();
  document.body.removeChild(triggerLink);

  URL.revokeObjectURL(downloadUrl);
}

export default function AuditLogTable() {
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [totalElements, setTotalElements] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const [search, setSearch] = React.useState("");

  const [levelFilter, setLevelFilter] = React.useState("All Levels");

  const [workspaceFilter, setWorkspaceFilter] =
    React.useState("All Workspaces");

  const [sortField, setSortField] = React.useState<SortField | null>(null);

  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  const [currentPage, setCurrentPage] = React.useState(1);

  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const [pageKey, setPageKey] = React.useState(0);

  // Debounce the free-text search so we don't hit the server on every keypress.
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to the first page whenever a server-side filter changes.
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, levelFilter, rowsPerPage]);

  // Server-side fetch: search + severity + pagination are handled by the API.
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    auditLogsApi
      .list({
        search: debouncedSearch.trim() || undefined,
        severity: levelFilter === "All Levels" ? undefined : levelFilter,
        page: currentPage - 1,
        size: rowsPerPage,
        sort: "createdAt,desc",
      })
      .then((res) => {
        if (cancelled) return;
        setLogs(res.content.map(fromApi));
        setTotalElements(res.totalElements);
      })
      .catch(() => {
        if (cancelled) return;
        setLogs([]);
        setTotalElements(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, levelFilter, currentPage, rowsPerPage]);

  // Sorting is applied client-side to the current page only (the server already
  // returns pages newest-first).
  const paged = React.useMemo(() => {
    if (!sortField) return logs;
    return [...logs].sort((a, b) => {
      const av = String(a[sortField] ?? "");
      const bv = String(b[sortField] ?? "");
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [logs, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalElements / rowsPerPage));

  const safePage = Math.min(currentPage, totalPages);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function goToPage(page: number) {
    const next = Math.max(1, Math.min(page, totalPages));

    setCurrentPage(next);
    setPageKey((k) => k + 1);
  }
  function triggerJsonExport() {
    exportToJson(
      paged,
      `system_audit_logs_${new Date().toISOString().split("T")[0]}.json`,
    );
  }
  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 text-sm">
      <span className="text-muted-foreground">
        {totalElements} results(s)
      </span>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground whitespace-nowrap">
          Rows per page
        </span>

        <Select
          value={String(rowsPerPage)}
          onValueChange={(value) => {
            setRowsPerPage(Number(value));

            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-16">
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            {[10, 20, 50].map((row) => (
              <SelectItem key={row} value={String(row)}>
                {row}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-muted-foreground whitespace-nowrap mr-1">
          Page {safePage} of {totalPages}
        </span>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(1)}
          disabled={safePage === 1}
        >
          <ChevronsLeft className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(safePage - 1)}
          disabled={safePage === 1}
        >
          <ChevronLeft className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(safePage + 1)}
          disabled={safePage === totalPages}
        >
          <ChevronRight className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(totalPages)}
          disabled={safePage === totalPages}
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>

        <p className="text-sm text-muted-foreground">
          Immutable system-wide audit trail — All user actions logged
        </p>
      </div>
      <Separator />

      {/* Table Card */}
      <div className="bg-background ">
        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4" data-guide="audit-filters">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Filter by event, actor, or level..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Level Filter */}
            <Select
              value={levelFilter}
              onValueChange={(v) => v !== null && setLevelFilter(v)}
            >
              <SelectTrigger className="min-w-32">
                <span className="flex-1 text-sm text-left">
                  {levelFilter === "All Levels" ? "All Levels" : levelFilter}
                </span>
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="All Levels">All Levels</SelectItem>

                <SelectItem value="INFO">INFO</SelectItem>

                <SelectItem value="WARN">WARN</SelectItem>

                <SelectItem value="HIGH">HIGH</SelectItem>
              </SelectContent>
            </Select>

            {/* Workspace Filter */}
            <Select
              value={workspaceFilter}
              onValueChange={(v) => v !== null && setWorkspaceFilter(v)}
            >
              <SelectTrigger className="min-w-32">
                <span className="flex-1 text-sm text-left">
                  {workspaceFilter === "All Workspaces"
                    ? "All Workspaces"
                    : workspaceFilter}
                </span>
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="All Workspaces">All Workspaces</SelectItem>

                <SelectItem value="Marketing">Marketing</SelectItem>

                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Export */}
          <Button
            onClick={triggerJsonExport}
            className="shrink-0 flex items-center gap-2"
          >
            <FileDown className="size-4" />
            Export JSON
          </Button>
        </div>

        {/* Table */}
        <Table pagination={pagination}>
          <TableHeader>
            <TableRow>
              <SortableHead
                field="timestamp"
                onSort={handleSort}
                className="w-[250px]"
              >
                Timestamp
              </SortableHead>

              <SortableHead field="level" onSort={handleSort}>
                Level
              </SortableHead>

              <SortableHead field="actor" onSort={handleSort}>
                Actor
              </SortableHead>

              <SortableHead field="event" onSort={handleSort}>
                Event
              </SortableHead>

              <SortableHead field="resource" onSort={handleSort}>
                Resource
              </SortableHead>

              <SortableHead field="ip" onSort={handleSort}>
                IP Address
              </SortableHead>

              <TableHead className="w-40 text-left">Details</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody key={pageKey} className="animate-in fade-in duration-200">
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-muted-foreground"
                >
                  Loading logs…
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-muted-foreground"
                >
                  No logs found.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {paged.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.timestamp}
                    </TableCell>

                    <TableCell>
                      <LevelBadge level={item.level} />
                    </TableCell>

                    <TableCell>{item.actor}</TableCell>

                    <TableCell>{item.event}</TableCell>

                    <TableCell>{item.resource}</TableCell>

                    <TableCell>{item.ip}</TableCell>

                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Dialog>
                          <DialogTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-8 w-8 text-slate-500 hover:text-slate-700"
                              />
                            }
                          >
                            <Eye className="size-4" />
                          </DialogTrigger>

                          <DialogContent className="sm:max-w-[520px] rounded-2xl">
                            <DialogHeader>
                              <DialogTitle>Audit Log Details</DialogTitle>

                              <DialogDescription>
                                Detailed event information
                              </DialogDescription>
                            </DialogHeader>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                              <div className="space-y-0.5">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                  Timestamp
                                </p>

                                <p className="mt-1 text-sm font-semibold">
                                  {item.timestamp}
                                </p>
                              </div>

                              <div className="space-y-0.5">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                  Level
                                </p>
                                <div className="mt-2">
                                  <LevelBadge level={item.level} />
                                </div>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                  Actor
                                </p>

                                <p className="mt-1 text-sm font-semibold">
                                  {item.actor}
                                </p>
                              </div>

                              <div className="space-y-0.5">
                                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                  Resource
                                </p>
                                <p className="mt-1 text-sm font-semibold">
                                  {item.resource}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Event
                              </p>

                              <p className="mt-1 text-sm font-semibold">
                                {item.event}
                              </p>
                            </div>

                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                IP Address
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {item.ip}
                              </p>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
