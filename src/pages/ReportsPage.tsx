"use client";

import * as React from "react";
import { Building2, CheckCircle2, MessageSquareShare, Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "./reports/FadeIn";
import { StatTile } from "./reports/StatTile";
import { AnalyticsTab } from "./reports/AnalyticsTab";
import { CampaignsTab } from "./reports/CampaignsTab";
import { UsersTab } from "./reports/UsersTab";
import { MessageLogTab } from "./reports/MessageLogTab";
import { PERIOD_OPTIONS, periodToDates } from "./reports/data";
import { useAuth } from "@/contexts/AuthContext";
import { atLeast } from "@/lib/permissions";
import { reportsApi, campaignsApi } from "@/lib/services";
import type { DashboardSummary, DailyTrendPoint, CampaignSummaryPoint, ApiCampaign } from "@/lib/services";

export default function ReportsPage() {
  const { user } = useAuth();
  const isDeptHead   = atLeast(user?.role, "DEPT_HEAD");
  const isSuperAdmin = atLeast(user?.role, "SUPER_ADMIN");

  const [period, setPeriod] = React.useState("3m");
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "3 Months";

  const [summary, setSummary]     = React.useState<DashboardSummary | null>(null);
  const [campaigns, setCampaigns] = React.useState<ApiCampaign[]>([]);

  const [dailyTrend, setDailyTrend]               = React.useState<DailyTrendPoint[]>([]);
  const [campaignSummaries, setCampaignSummaries] = React.useState<CampaignSummaryPoint[]>([]);
  const [loading, setLoading]                     = React.useState(true);

  // SUPER_ADMIN gets platform-wide aggregates via the null-workspace sentinel
  const GLOBAL_WS = "00000000-0000-0000-0000-000000000000";
  const reportWsId = isSuperAdmin ? GLOBAL_WS : undefined;

  React.useEffect(() => {
    reportsApi.dashboardSummary(reportWsId).then(setSummary).catch(() => {});
    campaignsApi.list().then(setCampaigns).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    setLoading(true);
    const { from, to } = periodToDates(period);
    Promise.all([
      reportsApi.dailyTrend(from, to, reportWsId).then(setDailyTrend),
      reportsApi.campaignSummaries(from, to, reportWsId).then(setCampaignSummaries),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  // Period-filtered message totals for stat tiles
  const trendTotals = React.useMemo(() => {
    let sent = 0, delivered = 0, failed = 0;
    for (const pt of dailyTrend) {
      if (pt.status === "SENT" || pt.status === "DELIVERED") sent += pt.total;
      if (pt.status === "DELIVERED") delivered += pt.total;
      if (pt.status === "FAILED" || pt.status === "EXPIRED") failed += pt.total;
    }
    const denom = sent + failed;
    const rate = denom > 0 ? (delivered / denom) * 100 : 0;
    return { sent, rate };
  }, [dailyTrend]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Analytics & Reports</h1>
          <p className="text-sm text-muted-foreground">
            Track message delivery, campaign performance, and engagement trends over time.
          </p>
        </div>
        <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
          <SelectTrigger className="w-36 shrink-0">
            <span className="text-sm">{periodLabel}</span>
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Separator />

      <FadeIn>
        {() => (
          <div className="flex flex-wrap gap-4">
            {isDeptHead && (
              <StatTile
                title="Total Users"
                value={summary ? summary.totalUsers.toLocaleString() : "—"}
                caption={!isSuperAdmin ? "In your workspace" : "Across all workspaces"}
                icon={Users}
              />
            )}
            <StatTile
              title="Messages Sent"
              value={loading ? "—" : trendTotals.sent.toLocaleString()}
              caption={`In the last ${periodLabel.toLowerCase()}`}
              icon={MessageSquareShare}
            />
            <StatTile
              title="Delivery Rate"
              value={loading ? "—" : `${trendTotals.rate.toFixed(1)}%`}
              caption="Successfully delivered"
              icon={CheckCircle2}
            />
            {isSuperAdmin && (
              <StatTile
                title="Workspaces"
                value={summary ? summary.activeWorkspaces.toLocaleString() : "—"}
                caption="Across the organization"
                icon={Building2}
              />
            )}
          </div>
        )}
      </FadeIn>

      <Tabs defaultValue="analytics">
        <TabsList data-guide="reports-tabs">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="messages">Message Log</TabsTrigger>
          {isDeptHead && (
            <TabsTrigger value="users">Users & Access</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="analytics" className="mt-6 space-y-6">
          <AnalyticsTab
            period={period}
            periodLabel={periodLabel}
            dailyTrend={dailyTrend}
            campaigns={campaigns}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="campaigns" className="mt-6 space-y-6">
          <CampaignsTab
            period={period}
            periodLabel={periodLabel}
            campaigns={campaigns}
            campaignSummaries={campaignSummaries}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="messages" className="mt-6 space-y-6">
          <MessageLogTab period={period} workspaceId={reportWsId} />
        </TabsContent>

        {isDeptHead && (
          <TabsContent value="users" className="mt-6 space-y-6">
            <UsersTab period={period} periodLabel={periodLabel} summary={summary} workspaceId={reportWsId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
