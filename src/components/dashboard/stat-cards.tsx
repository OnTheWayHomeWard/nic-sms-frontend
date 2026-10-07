"use client";

import * as React from "react";
import {
  CheckCircle2,
  Home,
  MessageSquareText,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { reportsApi } from "@/lib/services";
import type { DashboardSummary } from "@/lib/services";
import { useAuth } from "@/contexts/AuthContext";
import { atLeast } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export default function StatCards() {
  const { user } = useAuth();
  const isSuperAdmin = atLeast(user?.role, "SUPER_ADMIN");
  const isDeptHead   = atLeast(user?.role, "DEPT_HEAD");

  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  const GLOBAL_WS = "00000000-0000-0000-0000-000000000000";

  React.useEffect(() => {
    reportsApi
      .dashboardSummary(isSuperAdmin ? GLOBAL_WS : undefined)
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSuperAdmin]);

  // Skeleton only while actually loading. Once the fetch settles, a missing
  // value renders as "—" instead of an eternal skeleton — e.g. a Delegate
  // (CEO role) has no REPORT_VIEW authority, so the summary call 403s.
  function val(n: number | undefined) {
    if (loading) return <Skeleton className="h-7 w-20" />;
    return n === undefined ? "—" : n.toLocaleString();
  }

  function pct(n: number | undefined) {
    if (loading) return <Skeleton className="h-7 w-20" />;
    return n === undefined ? "—" : `${n.toFixed(1)}%`;
  }

  const cards = [
    ...(isSuperAdmin
      ? [
          {
            title: "Active Workspaces",
            value: val(summary?.activeWorkspaces),
            description: "Across the organization",
            icon: Home,
          },
        ]
      : []),
    ...(isDeptHead
      ? [
          {
            title: "Total Users",
            value: val(summary?.totalUsers),
            description: isSuperAdmin ? "Across all workspaces" : "In your workspace",
            icon: Users,
          },
        ]
      : []),
    {
      title: "Messages",
      value: val(summary?.totalMessages),
      description: "All-time sent messages",
      icon: MessageSquareText,
    },
    {
      title: "Delivery Rate",
      value: pct(summary?.deliveryRatePct),
      description: "Successfully delivered",
      icon: CheckCircle2,
    },
    {
      title: "Failed",
      value: val(summary?.failedMessages),
      description: "All-time failed messages",
      icon: TriangleAlert,
    },
  ];

  const limit = summary?.dailySmsLimit ?? null;
  // Usage is measured in SMS segments: a long or Amharic message is several
  // SMS to the operator. Falls back to messages on an older backend.
  const usedToday = summary?.todaySegments ?? summary?.todayMessages ?? 0;
  const usagePct = limit && limit > 0 ? Math.min(100, (usedToday / limit) * 100) : 100;
  const atLimit = limit != null && usedToday >= limit;

  return (
    <div className="space-y-4">
    <div className="flex flex-wrap gap-4" data-guide="dash-stats">
      {cards.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.title} className="flex-1 min-w-52">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{item.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>

    {limit != null && (
      <div
        data-guide="dash-usage"
        className="rounded-xl border bg-card p-4 space-y-2"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Today&apos;s SMS usage</span>
          <span className="tabular-nums text-muted-foreground">
            {usedToday.toLocaleString()} / {limit.toLocaleString()}
          </span>
        </div>
        <Progress
          value={usagePct}
          className={cn("h-2", atLimit && "[&>*]:bg-destructive")}
        />
        {atLimit && (
          <p className="text-xs text-destructive">
            Daily limit reached — further sends may be blocked until tomorrow.
          </p>
        )}
      </div>
    )}
    </div>
  );
}
