"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  apiErrorMessage,
  reportsApi,
  type DeliveryReport,
  type ReportExportStatus,
} from "@/lib/services";
import { periodToDates } from "./data";

const STATUS_STYLE: Record<string, string> = {
  DELIVERED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  FAILED: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-destructive/10 text-destructive",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  QUEUED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

const STATUS_OPTIONS = ["ALL", "DELIVERED", "SENT", "FAILED", "PENDING", "QUEUED", "EXPIRED"];
const PAGE_SIZE = 20;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "yyyy-MM-dd HH:mm");
  } catch {
    return iso;
  }
}

export function MessageLogTab({
  period,
  workspaceId,
}: {
  period: string;
  workspaceId?: string;
}) {
  const [status, setStatus] = React.useState("ALL");
  const [page, setPage] = React.useState(0);
  const [report, setReport] = React.useState<DeliveryReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exports, setExports] = React.useState<ReportExportStatus[]>([]);
  const [requesting, setRequesting] = React.useState(false);

  const { from, to } = React.useMemo(() => periodToDates(period), [period]);

  const load = React.useCallback(() => {
    setLoading(true);
    reportsApi
      .messages({
        from,
        to,
        workspaceId,
        status: status === "ALL" ? undefined : status,
        page,
        size: PAGE_SIZE,
      })
      .then(setReport)
      .catch((err) =>
        toast.error(apiErrorMessage(err, "Failed to load messages."), {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        }),
      )
      .finally(() => setLoading(false));
  }, [from, to, workspaceId, status, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  const loadExports = React.useCallback(() => {
    reportsApi.listExports().then(setExports).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadExports();
  }, [loadExports]);

  // Poll exports while any is still processing so the download link appears
  // without a manual refresh.
  React.useEffect(() => {
    if (!exports.some((e) => e.status === "QUEUED" || e.status === "PROCESSING")) return;
    const t = setInterval(loadExports, 4000);
    return () => clearInterval(t);
  }, [exports, loadExports]);

  React.useEffect(() => {
    setPage(0);
  }, [status, period]);

  async function requestExport(fmtType: "XLSX" | "CSV") {
    setRequesting(true);
    try {
      await reportsApi.requestExport({
        format: fmtType,
        from,
        to,
        status: status === "ALL" ? undefined : status,
      });
      toast.success(`${fmtType} export queued — it'll appear below when ready.`);
      loadExports();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to request export."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setRequesting(false);
    }
  }

  async function download(id: string) {
    try {
      const blob = await reportsApi.downloadExport(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-export-${id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to download."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  const totalPages = report ? Math.max(1, Math.ceil(report.totalCount / PAGE_SIZE)) : 1;
  const rows = report?.rows ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3" data-guide="reports-export">
        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger className="min-w-36">
            <span className="text-sm">{status === "ALL" ? "All statuses" : status}</span>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => requestExport("XLSX")} disabled={requesting}>
            <FileDown className="size-4" />
            Export XLSX
          </Button>
          <Button variant="outline" size="sm" onClick={() => requestExport("CSV")} disabled={requesting}>
            <FileDown className="size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {report && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="text-muted-foreground">
            {report.totalCount.toLocaleString()} messages ·
          </span>
          <span className="text-green-600 dark:text-green-400">
            {report.totals.delivered.toLocaleString()} delivered
          </span>
          <span className="text-blue-600 dark:text-blue-400">{report.totals.sent.toLocaleString()} sent</span>
          <span className="text-destructive">{report.totals.failed.toLocaleString()} failed</span>
          <span className="text-amber-600 dark:text-amber-400">{report.totals.pending.toLocaleString()} pending</span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Number</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Carrier</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Sent</th>
              <th className="px-4 py-2.5 font-medium">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-2.5">
                      <Skeleton className="h-4 w-full max-w-24 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No messages match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-mono text-xs">{m.to}</td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn("border-0", STATUS_STYLE[m.status] ?? "bg-muted text-muted-foreground")}
                    >
                      {m.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{m.carrier ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{fmt(m.createdAt)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{fmt(m.sentAt)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{fmt(m.deliveredAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Recent exports */}
      {exports.length > 0 && (
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm font-medium">Recent exports</p>
          <div className="space-y-1">
            {exports.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground text-xs">
                  {e.format} · {fmt(e.createdAt)}
                </span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-0 text-xs",
                      e.status === "DONE"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : e.status === "FAILED"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
                    )}
                  >
                    {e.status}
                  </Badge>
                  {e.status === "DONE" && (
                    <Button variant="ghost" size="icon-sm" onClick={() => download(e.id)} title="Download">
                      <Download className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
