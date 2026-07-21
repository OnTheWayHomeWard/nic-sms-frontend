"use client";

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { auditLogsApi } from "@/lib/services";
import type { ApiAuditLog } from "@/lib/services";

function severityClass(severity: string) {
  if (severity === "INFO") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  if (severity === "WARN") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400";
  // HIGH maps to red (backend has no "ERROR" — it uses "HIGH")
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditEvents() {
  const navigate = useNavigate();
  const [events, setEvents]   = React.useState<ApiAuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    auditLogsApi
      .list({ size: 6, sort: "createdAt,desc" })
      .then((page) => setEvents(page.content))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recent Audit Events</CardTitle>
        <CardDescription>View audit summary below</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-5 w-10 rounded-sm shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))
          : events.length === 0
          ? (
            <p className="text-sm text-muted-foreground text-center py-4">No audit events found.</p>
          )
          : events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <Badge
                  variant="outline"
                  className={`rounded-sm border-0 text-[10px] shrink-0 ${severityClass(event.severity)}`}
                >
                  {event.severity}
                </Badge>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{event.action}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {event.actorUsername ?? "system"} • {fmtTs(event.createdAt)}
                  </p>
                </div>
              </div>
            ))
        }
        <div className="pt-6 text-center">
          <Button
            variant="ghost"
            className="h-auto p-0 text-sm gap-1 hover:bg-transparent hover:underline hover:underline-offset-2 cursor-pointer"
            onClick={() => navigate("/audit-logs")}
          >
            View Full Audit Log
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
