"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "./FadeIn";
import {
  campaignReachConfig,
  campaignStatusConfig,
  campaignTypeConfig,
  cumulativeConfig,
  deliveryRateConfig,
  fmtDate,
  fmtK,
  LEGEND_2COL,
  messageStatusConfig,
  messagesChartConfig,
  periodToDates,
} from "./data";
import type { ApiCampaign, DailyTrendPoint } from "@/lib/services";

interface AnalyticsTabProps {
  period: string;
  periodLabel: string;
  dailyTrend: DailyTrendPoint[];
  campaigns: ApiCampaign[];
  loading: boolean;
}

const KIND_LABEL: Record<string, string> = {
  INSTANT: "Instant",
  SCHEDULED: "Scheduled",
  REMINDER: "Reminder",
};

const STATUS_GROUP: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending",
  PENDING_HEAD: "Pending",
  PENDING_CEO: "Pending",
  APPROVED: "Approved",
  QUEUED: "Approved",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_FILL: Record<string, string> = {
  Draft: "#bb7a30",
  Pending: "#ed9634",
  Approved: "#3b82f6",
  Completed: "#22c55e",
  Cancelled: "#ef4444",
};

const MSG_STATUS_FILL: Record<string, string> = {
  DELIVERED: "#22c55e",
  SENT:      "#3b82f6",
  QUEUED:    "#a78bfa",
  PENDING:   "#fbbf24",
  FAILED:    "#ef4444",
  EXPIRED:   "#6b7280",
};

function ExternalLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center pt-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="p-6">
      <Skeleton className="h-52 w-full rounded-lg" />
    </div>
  );
}

export function AnalyticsTab({ period, periodLabel, dailyTrend, campaigns, loading }: AnalyticsTabProps) {
  const { from } = React.useMemo(() => periodToDates(period), [period]);

  const messagesSentData = React.useMemo(() => {
    const byDay = new Map<string, { sent: number; failed: number }>();
    for (const pt of dailyTrend) {
      const e = byDay.get(pt.day) ?? { sent: 0, failed: 0 };
      if (pt.status === "SENT" || pt.status === "DELIVERED") e.sent += pt.total;
      if (pt.status === "FAILED" || pt.status === "EXPIRED") e.failed += pt.total;
      byDay.set(pt.day, e);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));
  }, [dailyTrend]);

  const cumulativeData = React.useMemo(() => {
    let total = 0;
    return messagesSentData.map((d) => {
      total += d.sent + d.failed;
      return { date: d.date, total };
    });
  }, [messagesSentData]);

  const messageStatusData = React.useMemo(() => {
    const agg = new Map<string, number>();
    for (const pt of dailyTrend) {
      agg.set(pt.status, (agg.get(pt.status) ?? 0) + pt.total);
    }
    return Array.from(agg.entries())
      .map(([status, value]) => ({ status, value, fill: MSG_STATUS_FILL[status] ?? "#94a3b8" }))
      .sort((a, b) => b.value - a.value);
  }, [dailyTrend]);

  const periodCampaigns = React.useMemo(
    () => campaigns.filter((c) => c.createdAt >= from),
    [campaigns, from]
  );

  const campaignTypeData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of periodCampaigns) {
      const label = KIND_LABEL[c.kind] ?? c.kind;
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [periodCampaigns]);

  const campaignStatusData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of periodCampaigns) {
      const group = STATUS_GROUP[c.status] ?? c.status;
      counts[group] = (counts[group] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count, fill: STATUS_FILL[status] ?? "#94a3b8" }))
      .sort((a, b) => b.count - a.count);
  }, [periodCampaigns]);

  const campaignReachData = React.useMemo(
    () =>
      [...periodCampaigns]
        .filter((c) => c.recipientCount != null)
        .sort((a, b) => (b.recipientCount ?? 0) - (a.recipientCount ?? 0))
        .slice(0, 10)
        .map((c) => ({ campaign: c.name, reach: c.recipientCount ?? 0 })),
    [periodCampaigns]
  );

  const deliveryRateData = React.useMemo(() => {
    const byDay = new Map<string, { sent: number; delivered: number; failed: number }>();
    for (const pt of dailyTrend) {
      const e = byDay.get(pt.day) ?? { sent: 0, delivered: 0, failed: 0 };
      if (pt.status === "SENT")      e.sent += pt.total;
      if (pt.status === "DELIVERED") e.delivered += pt.total;
      if (pt.status === "FAILED" || pt.status === "EXPIRED") e.failed += pt.total;
      byDay.set(pt.day, e);
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => {
        const denom = v.sent + v.delivered + v.failed;
        return { date, rate: denom > 0 ? Math.round((v.delivered / denom) * 1000) / 10 : 0 };
      });
  }, [dailyTrend]);

  const [activeChart, setActiveChart] = React.useState<"sent" | "failed">("sent");
  const totals = React.useMemo(
    () => ({
      sent:   messagesSentData.reduce((s, d) => s + d.sent, 0),
      failed: messagesSentData.reduce((s, d) => s + d.failed, 0),
    }),
    [messagesSentData]
  );

  return (
    <>
      {/* 1. Messages Sent — Interactive Bar */}
      <FadeIn>
        {(inView) => (
          <Card>
            <CardHeader className="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
              <div className="flex flex-1 flex-col justify-center gap-1 px-6 py-5 sm:py-6">
                <CardTitle>Messages Sent</CardTitle>
                <CardDescription>
                  Total dispatches over the last {periodLabel.toLowerCase()}
                </CardDescription>
              </div>
              <div className="flex">
                {(["sent", "failed"] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setActiveChart(key)}
                    className={`relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left
                      even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6
                      ${activeChart === key ? "bg-muted/50" : ""}`}
                  >
                    <span className="text-xs text-muted-foreground">
                      {messagesChartConfig[key].label}
                    </span>
                    <span className="text-lg font-bold leading-none sm:text-3xl">
                      {totals[key].toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:p-6">
              {loading ? (
                <Skeleton className="h-52 w-full rounded-lg" />
              ) : (
                <ChartContainer
                  key={inView ? 1 : 0}
                  config={messagesChartConfig}
                  className="aspect-auto h-50 w-full"
                >
                  <BarChart data={messagesSentData} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={32}
                      tickFormatter={(v) => fmtDate(v, { month: "short", day: "numeric" })}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          className="w-37.5"
                          nameKey="views"
                          labelFormatter={(v) =>
                            fmtDate(v as string, { month: "short", day: "numeric", year: "numeric" })
                          }
                        />
                      }
                    />
                    <Bar dataKey={activeChart} fill={`var(--color-${activeChart})`} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        )}
      </FadeIn>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 2. Cumulative Message Growth */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Cumulative Message Growth</CardTitle>
                <CardDescription>Running total of all dispatched messages</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={cumulativeConfig} className="h-52 w-full">
                    <AreaChart data={cumulativeData} margin={{ left: 12, right: 12 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={32}
                        tickFormatter={(v) => fmtDate(v, { month: "short", day: "numeric" })}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        dataKey="total"
                        type="monotone"
                        fill="var(--color-total)"
                        fillOpacity={0.3}
                        stroke="var(--color-total)"
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 3. Message Status Distribution (replaces Failure Reasons pie) */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Message Status Distribution</CardTitle>
                <CardDescription>Breakdown of all message outcomes</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={messageStatusConfig} className="h-52 w-full">
                    <PieChart>
                      <Pie
                        data={messageStatusData}
                        dataKey="value"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                      >
                        {messageStatusData.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                    </PieChart>
                  </ChartContainer>
                )}
                <ExternalLegend
                  items={messageStatusData.map((d) => ({
                    label:
                      (messageStatusConfig[d.status as keyof typeof messageStatusConfig] as { label: string } | undefined)
                        ?.label ?? d.status,
                    color: d.fill,
                  }))}
                />
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 4. Campaign Type Distribution */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Campaign Types</CardTitle>
                <CardDescription>
                  Distribution by kind in the last {periodLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={campaignTypeConfig} className="h-52 w-full">
                    <PieChart>
                      <Pie
                        data={campaignTypeData}
                        dataKey="count"
                        nameKey="type"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                      >
                        {campaignTypeData.map((entry) => (
                          <Cell
                            key={entry.type}
                            fill={
                              (campaignTypeConfig[entry.type as keyof typeof campaignTypeConfig] as { color?: string } | undefined)
                                ?.color ?? "#94a3b8"
                            }
                          />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent nameKey="type" />} />
                      <ChartLegend
                        content={<ChartLegendContent nameKey="type" className={LEGEND_2COL} />}
                      />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 5. Campaign Status Distribution */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Campaign Status Overview</CardTitle>
                <CardDescription>
                  Status breakdown in the last {periodLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={campaignStatusConfig} className="h-52 w-full">
                    <PieChart>
                      <Pie
                        data={campaignStatusData}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                      >
                        {campaignStatusData.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                    </PieChart>
                  </ChartContainer>
                )}
                <ExternalLegend
                  items={campaignStatusData.map((d) => ({ label: d.status, color: d.fill }))}
                />
              </CardContent>
            </Card>
          )}
        </FadeIn>
      </div>

      {/* 6. Campaign Reach */}
      <FadeIn>
        {(inView) => (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Reach</CardTitle>
              <CardDescription>
                Top campaigns by recipient count in the last {periodLabel.toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <ChartSkeleton />
              ) : (
                <ChartContainer key={inView ? 1 : 0} config={campaignReachConfig} className="h-64 w-full">
                  <BarChart data={campaignReachData} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtK} tickLine={false} axisLine={false} />
                    <YAxis dataKey="campaign" type="category" tickLine={false} axisLine={false} width={140} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="reach" fill="var(--color-reach)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        )}
      </FadeIn>

      {/* 7. Delivery Rate Trend */}
      <FadeIn>
        {(inView) => (
          <Card>
            <CardHeader>
              <CardTitle>Delivery Rate Trend</CardTitle>
              <CardDescription>
                Daily delivery rate (%) over the last {periodLabel.toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <ChartSkeleton />
              ) : (
                <ChartContainer key={inView ? 1 : 0} config={deliveryRateConfig} className="h-52 w-full">
                  <AreaChart data={deliveryRateData} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={32}
                      tickFormatter={(v) => fmtDate(v, { month: "short", day: "numeric" })}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(v) => [`${v}%`, "Delivery Rate"]}
                        />
                      }
                    />
                    <Area
                      dataKey="rate"
                      type="monotone"
                      fill="var(--color-rate)"
                      fillOpacity={0.3}
                      stroke="var(--color-rate)"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        )}
      </FadeIn>
    </>
  );
}
