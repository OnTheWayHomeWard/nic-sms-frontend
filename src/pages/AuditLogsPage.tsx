"use client";

import * as React from "react";

import {
  ArrowDown,
  ArrowUp,
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
import { useAuth } from "@/contexts/AuthContext";
import { eatDateToUtcIso, EAT_LABEL, formatEat } from "@/lib/eat-time";
import {
  auditLogsApi,
  workspacesApi,
  type ApiAuditLog,
  type ApiWorkspace,
  type AuditLogQuery,
  type AuditOutcome,
  type AuditSeverity,
} from "@/lib/services";

// ─── Types ─────────────────────────────────────────────

/** Backend property names the server sorts by (see AuditLogController). */
type SortField =
  | "createdAt"
  | "severity"
  | "outcome"
  | "actorDisplayName"
  | "description"
  | "entityType"
  | "ipAddress";

type SortDir = "asc" | "desc";

const ALL = "__all__";

const CATEGORIES = [
  "AUTH",
  "ADMIN",
  "WORKSPACE",
  "CONTACT",
  "GROUP",
  "CAMPAIGN",
  "TEMPLATE",
  "REMINDER",
  "SETTINGS",
  "REPORT",
  "SYSTEM",
];

// ─── Helpers ───────────────────────────────────────────

function actorLabel(log: ApiAuditLog): string {
  return log.actorDisplayName ?? log.actorUsername ?? "System";
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : "";
}

function recordLabel(log: ApiAuditLog): string {
  if (!log.entityType) return "—";
  const key =
    log.entityId ??
    (typeof log.detail?.entityKey === "string" ? log.detail.entityKey : null);
  return key ? `${log.entityType} · ${key.length > 12 ? shortId(key) : key}` : log.entityType;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toExportRow(log: ApiAuditLog) {
  return {
    timeEAT: formatEat(log.createdAt),
    timeUTC: log.createdAt,
    severity: log.severity,
    outcome: log.outcome,
    errorReason: log.errorReason,
    action: log.description ?? log.action,
    actionCode: log.action,
    category: log.category,
    actorName: log.actorDisplayName,
    actorUsername: log.actorUsername,
    actorRole: log.actorRole,
    actorUserId: log.actorUserId,
    delegated: log.detail?.delegated === true,
    entityType: log.entityType,
    entityId: log.entityId ?? (log.detail?.entityKey as string | undefined) ?? null,
    workspaceId: log.workspaceId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    changes: log.changes,
  };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

// ─── Sortable Header ──────────────────────────────────

function SortableHead({
  children,
  field,
  sortField,
  sortDir,
  onSort,
  className,
}: {
  children: React.ReactNode;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const Icon = sortField !== field ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button onClick={() => onSort(field)} className="flex items-center gap-1">
        {children}
        <Icon className="size-3.5 text-muted-foreground" />
      </button>
    </TableHead>
  );
}

// ─── Badges ────────────────────────────────────────────

function LevelBadge({ level }: { level: AuditSeverity }) {
  const cls =
    level === "INFO"
      ? "bg-sky-100 text-sky-600"
      : level === "WARN"
        ? "bg-yellow-100 text-yellow-600"
        : "bg-pink-100 text-pink-600";
  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${cls}`}>
      {level}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  return outcome === "FAILURE" ? (
    <span className="inline-flex rounded-md bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-600">
      FAILED
    </span>
  ) : (
    <span className="inline-flex rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
      SUCCESS
    </span>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`space-y-0.5 min-w-0 ${full ? "col-span-2" : ""}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="mt-1 text-sm font-semibold break-words">{children}</div>
    </div>
  );
}

// ─── Details dialog ────────────────────────────────────

function AuditDetails({ log }: { log: ApiAuditLog }) {
  const changes = log.changes ? Object.entries(log.changes) : [];
  const extra = Object.entries(log.detail ?? {}).filter(
    ([k]) => k !== "changes" && k !== "delegated",
  );
  const delegated = log.detail?.delegated === true;

  return (
    <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto rounded-2xl">
      <DialogHeader>
        <DialogTitle>{log.description ?? log.action}</DialogTitle>
        <DialogDescription className="font-mono text-xs">{log.action}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Field label={`Time (${EAT_LABEL})`}>{formatEat(log.createdAt)}</Field>
        <Field label="Result">
          <div className="flex items-center gap-2">
            <OutcomeBadge outcome={log.outcome} />
            <LevelBadge level={log.severity} />
          </div>
        </Field>

        {log.outcome === "FAILURE" && (
          <Field label="Error reason" full>
            <span className="text-red-600">{log.errorReason ?? "—"}</span>
          </Field>
        )}

        <Field label="Actor">
          {actorLabel(log)}
          {log.actorUsername && log.actorDisplayName && (
            <span className="block text-xs font-normal text-muted-foreground">
              {log.actorUsername}
            </span>
          )}
        </Field>
        <Field label="Role">
          {log.actorRole ?? "—"}
          {delegated && (
            <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
              via delegation
            </span>
          )}
        </Field>

        <Field label="Record type">{log.entityType ?? "—"}</Field>
        <Field label="Record ID">
          <span className="font-mono text-xs">
            {log.entityId ?? formatValue(log.detail?.entityKey)}
          </span>
        </Field>

        <Field label="Category">{log.category}</Field>
        <Field label="Workspace">
          <span className="font-mono text-xs">{log.workspaceId ?? "—"}</span>
        </Field>

        <Field label="IP address">{log.ipAddress ?? "—"}</Field>
        <Field label="User agent" full>
          <span className="font-normal text-xs">{log.userAgent ?? "—"}</span>
        </Field>
      </div>

      {changes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Changes</p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Field</th>
                  <th className="px-2 py-1.5 text-left font-medium">Before</th>
                  <th className="px-2 py-1.5 text-left font-medium">After</th>
                </tr>
              </thead>
              <tbody>
                {changes.map(([field, c]) => (
                  <tr key={field} className="border-t align-top">
                    <td className="px-2 py-1.5 font-medium">{field}</td>
                    <td className="px-2 py-1.5 text-red-700 break-all">{formatValue(c.before)}</td>
                    <td className="px-2 py-1.5 text-emerald-700 break-all">{formatValue(c.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {extra.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Additional details</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
            {extra.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all">{formatValue(v)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      )}
    </DialogContent>
  );
}

// ─── Page ──────────────────────────────────────────────

export default function AuditLogTable() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [logs, setLogs] = React.useState<ApiAuditLog[]>([]);
  const [totalElements, setTotalElements] = React.useState(0);
  // Key of the request whose results are on screen; loading is derived from it.
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [levelFilter, setLevelFilter] = React.useState(ALL);
  const [outcomeFilter, setOutcomeFilter] = React.useState(ALL);
  const [categoryFilter, setCategoryFilter] = React.useState(ALL);
  const [workspaceFilter, setWorkspaceFilter] = React.useState(ALL);
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  const [workspaces, setWorkspaces] = React.useState<ApiWorkspace[]>([]);

  const [sortField, setSortField] = React.useState<SortField>("createdAt");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [pageKey, setPageKey] = React.useState(0);

  // Debounce the free-text search so we don't hit the server on every keypress.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // The workspace filter is only meaningful for super admins: everyone else
  // is restricted to their current workspace by the server.
  React.useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    workspacesApi
      .list()
      .then((ws) => {
        if (!cancelled) setWorkspaces(ws);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  const filters = React.useMemo<Omit<AuditLogQuery, "page" | "size">>(
    () => ({
      search: debouncedSearch.trim() || undefined,
      severity: levelFilter === ALL ? undefined : levelFilter,
      outcome: outcomeFilter === ALL ? undefined : (outcomeFilter as AuditOutcome),
      category: categoryFilter === ALL ? undefined : categoryFilter,
      workspaceId: isSuperAdmin && workspaceFilter !== ALL ? workspaceFilter : undefined,
      startDate: startDate ? eatDateToUtcIso(startDate) : undefined,
      endDate: endDate ? eatDateToUtcIso(endDate, true) : undefined,
      sort: `${sortField},${sortDir}`,
    }),
    [
      debouncedSearch,
      levelFilter,
      outcomeFilter,
      categoryFilter,
      workspaceFilter,
      isSuperAdmin,
      startDate,
      endDate,
      sortField,
      sortDir,
    ],
  );

  const requestKey = JSON.stringify({ filters, currentPage, rowsPerPage });
  const loading = loadedKey !== requestKey;

  // Server-side fetch: filtering, sorting and pagination all happen in the API.
  React.useEffect(() => {
    let cancelled = false;
    auditLogsApi
      .list({ ...filters, page: currentPage - 1, size: rowsPerPage })
      .then((res) => {
        if (cancelled) return;
        setLogs(res.content);
        setTotalElements(res.totalElements);
        setLoadedKey(requestKey);
      })
      .catch(() => {
        if (cancelled) return;
        setLogs([]);
        setTotalElements(0);
        setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, currentPage, rowsPerPage, requestKey]);

  const totalPages = Math.max(1, Math.ceil(totalElements / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
    setCurrentPage(1);
  }

  /** Wraps a filter setter so changing a filter also returns to page 1. */
  function onFilter(setter: (v: string) => void) {
    return (v: string | null) => {
      if (v === null) return;
      setter(v);
      setCurrentPage(1);
    };
  }

  function goToPage(page: number) {
    const next = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(next);
    setPageKey((k) => k + 1);
  }

  async function triggerExport(format: "json" | "csv") {
    setExporting(true);
    try {
      const all = await auditLogsApi.listAll(filters);
      const rows = all.map(toExportRow);
      const stamp = new Date().toISOString().split("T")[0];
      if (format === "json") {
        downloadBlob(JSON.stringify(rows, null, 2), "application/json", `audit_log_${stamp}.json`);
      } else {
        const headers = Object.keys(rows[0] ?? toExportRow({} as ApiAuditLog));
        const lines = [
          headers.join(","),
          ...rows.map((r) => headers.map((h) => csvCell(r[h as keyof typeof r])).join(",")),
        ];
        downloadBlob(lines.join("\n"), "text/csv;charset=utf-8", `audit_log_${stamp}.csv`);
      }
    } finally {
      setExporting(false);
    }
  }

  const workspaceName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 text-sm">
      <span className="text-muted-foreground">{totalElements} result(s)</span>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground whitespace-nowrap">Rows per page</span>
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
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(1)} disabled={safePage === 1}>
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

  const sortProps = { sortField, sortDir, onSort: handleSort };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Tamper-evident trail of user and system actions. Times are shown in East Africa
          Time ({EAT_LABEL}, UTC+3).
        </p>
      </div>
      <Separator />

      <div className="bg-background">
        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4" data-guide="audit-filters">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search action, actor, record, IP…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={levelFilter} onValueChange={onFilter(setLevelFilter)}>
              <SelectTrigger className="min-w-32">
                <span className="flex-1 text-sm text-left">
                  {levelFilter === ALL ? "All levels" : levelFilter}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All levels</SelectItem>
                <SelectItem value="INFO">INFO</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
                <SelectItem value="CRITICAL">CRITICAL</SelectItem>
              </SelectContent>
            </Select>

            <Select value={outcomeFilter} onValueChange={onFilter(setOutcomeFilter)}>
              <SelectTrigger className="min-w-32">
                <span className="flex-1 text-sm text-left">
                  {outcomeFilter === ALL
                    ? "All results"
                    : outcomeFilter === "FAILURE"
                      ? "Failed"
                      : "Succeeded"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All results</SelectItem>
                <SelectItem value="SUCCESS">Succeeded</SelectItem>
                <SelectItem value="FAILURE">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={onFilter(setCategoryFilter)}>
              <SelectTrigger className="min-w-36">
                <span className="flex-1 text-sm text-left">
                  {categoryFilter === ALL ? "All categories" : categoryFilter}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isSuperAdmin && (
              <Select value={workspaceFilter} onValueChange={onFilter(setWorkspaceFilter)}>
                <SelectTrigger className="min-w-40">
                  <span className="flex-1 text-sm text-left truncate">
                    {workspaceFilter === ALL ? "All workspaces" : workspaceName(workspaceFilter)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All workspaces</SelectItem>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <label className="flex flex-col text-xs text-muted-foreground">
              From ({EAT_LABEL})
              <Input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => onFilter(setStartDate)(e.target.value)}
                className="h-9 w-40"
              />
            </label>
            <label className="flex flex-col text-xs text-muted-foreground">
              To ({EAT_LABEL})
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => onFilter(setEndDate)(e.target.value)}
                className="h-9 w-40"
              />
            </label>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void triggerExport("csv")}
              disabled={exporting}
              className="flex items-center gap-2"
            >
              <FileDown className="size-4" />
              CSV
            </Button>
            <Button
              onClick={() => void triggerExport("json")}
              disabled={exporting}
              className="flex items-center gap-2"
            >
              <FileDown className="size-4" />
              {exporting ? "Exporting…" : "Export JSON"}
            </Button>
          </div>
        </div>

        {/* Table */}
        <Table pagination={pagination}>
          <TableHeader>
            <TableRow>
              <SortableHead field="createdAt" {...sortProps} className="w-[190px]">
                Time ({EAT_LABEL})
              </SortableHead>
              <SortableHead field="severity" {...sortProps}>
                Level
              </SortableHead>
              <SortableHead field="outcome" {...sortProps}>
                Result
              </SortableHead>
              <SortableHead field="actorDisplayName" {...sortProps}>
                Actor
              </SortableHead>
              <SortableHead field="description" {...sortProps}>
                Action
              </SortableHead>
              <SortableHead field="entityType" {...sortProps}>
                Record
              </SortableHead>
              <SortableHead field="ipAddress" {...sortProps}>
                IP Address
              </SortableHead>
              <TableHead className="w-16 text-left">Details</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody key={pageKey} className="animate-in fade-in duration-200">
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Loading logs…
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No logs found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {formatEat(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <LevelBadge level={item.severity} />
                  </TableCell>
                  <TableCell>
                    <OutcomeBadge outcome={item.outcome} />
                  </TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate">{actorLabel(item)}</p>
                      {item.actorRole && (
                        <p className="text-xs text-muted-foreground">
                          {item.actorRole}
                          {item.detail?.delegated === true ? " · delegated" : ""}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p>{item.description ?? item.action}</p>
                    {item.outcome === "FAILURE" && item.errorReason && (
                      <p className="text-xs text-red-600 line-clamp-1" title={item.errorReason}>
                        {item.errorReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{recordLabel(item)}</TableCell>
                  <TableCell>{item.ipAddress ?? "—"}</TableCell>
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
                        <AuditDetails log={item} />
                      </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
