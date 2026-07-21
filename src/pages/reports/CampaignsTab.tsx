"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  Treemap,
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
  approvalConfig,
  campaignDeliveryConfig,
  creatorConfig,
  fmtK,
  funnelBarConfig,
  scheduledCampaignConfig,
  templateUsageConfig,
  typeRateConfig,
  periodToDates,
} from "./data";
import type { ApiCampaign, ApiGroup, ApiTemplate, CampaignSummaryPoint } from "@/lib/services";
import { groupsApi, templatesApi } from "@/lib/services";

interface CampaignsTabProps {
  period: string;
  periodLabel: string;
  campaigns: ApiCampaign[];
  campaignSummaries: CampaignSummaryPoint[];
  loading: boolean;
}

function ChartSkeleton() {
  return (
    <div className="p-6">
      <Skeleton className="h-52 w-full rounded-lg" />
    </div>
  );
}

const APPROVAL_FILL: Record<string, string> = {
  Pending:  "#ed9634",
  Approved: "#22c55e",
  Cancelled: "#ef4444",
};

const APPROVAL_GROUP: Record<string, string> = {
  PENDING_APPROVAL: "Pending",
  PENDING_HEAD:     "Pending",
  PENDING_CEO:      "Pending",
  APPROVED:         "Approved",
  QUEUED:           "Approved",
  COMPLETED:        "Approved",
  CANCELLED:        "Cancelled",
};

const SCHEDULED_STATUS_LABEL: Record<string, string> = {
  DRAFT:            "Draft",
  PENDING_APPROVAL: "Pending",
  PENDING_HEAD:     "Pending",
  PENDING_CEO:      "Pending",
  APPROVED:         "Approved",
  QUEUED:           "Queued",
  COMPLETED:        "Completed",
  CANCELLED:        "Cancelled",
};

const TREE_FILLS = [
  "var(--primary)", "#ed9634", "var(--secondary)", "#bb7a30",
  "#ceb847", "#78542e", "#3b82f6", "#a78bfa",
];

export function CampaignsTab({ period, periodLabel, campaigns, campaignSummaries, loading }: CampaignsTabProps) {
  const [groups, setGroups]       = React.useState<ApiGroup[]>([]);
  const [templates, setTemplates] = React.useState<ApiTemplate[]>([]);

  React.useEffect(() => {
    groupsApi.list().then(setGroups).catch(() => {});
    templatesApi.list().then(setTemplates).catch(() => {});
  }, []);

  const { from } = React.useMemo(() => periodToDates(period), [period]);

  const periodCampaigns = React.useMemo(
    () => campaigns.filter((c) => c.createdAt >= from),
    [campaigns, from]
  );

  const campaignMap = React.useMemo(
    () => new Map(campaigns.map((c) => [c.id, c])),
    [campaigns]
  );

  const templateNameMap = React.useMemo(
    () => new Map(templates.map((t) => [t.id, t.name])),
    [templates]
  );

  // 1. Campaign Delivery Performance
  const deliveryData = React.useMemo(
    () =>
      campaignSummaries
        .map((s) => {
          const c = campaignMap.get(s.campaignId);
          const total = s.delivered + s.sent + s.failed + s.pending;
          const rate = total > 0 ? Math.round((s.delivered / total) * 1000) / 10 : 0;
          return {
            name: c?.name ?? s.campaignId.slice(0, 8),
            delivered: s.delivered,
            failed: s.failed,
            rate,
          };
        })
        .sort((a, b) => b.delivered - a.delivered)
        .slice(0, 10),
    [campaignSummaries, campaignMap]
  );

  // 2. Delivery Rate by Campaign Type
  const typeRateData = React.useMemo(() => {
    const typeMap: Record<string, { total: number; delivered: number }> = {};
    for (const s of campaignSummaries) {
      const c = campaignMap.get(s.campaignId);
      const kind = c?.kind ?? "INSTANT";
      const label = { INSTANT: "Instant", SCHEDULED: "Scheduled", REMINDER: "Reminder" }[kind] ?? kind;
      if (!typeMap[label]) typeMap[label] = { total: 0, delivered: 0 };
      typeMap[label].delivered += s.delivered;
      typeMap[label].total += s.delivered + s.sent + s.failed + s.pending;
    }
    return Object.entries(typeMap).map(([type, v]) => ({
      type,
      rate: v.total > 0 ? Math.round((v.delivered / v.total) * 1000) / 10 : 0,
    }));
  }, [campaignSummaries, campaignMap]);

  // 3. Approval Pipeline
  const approvalData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of periodCampaigns) {
      const group = APPROVAL_GROUP[c.status];
      if (!group) continue;
      counts[group] = (counts[group] ?? 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
      fill: APPROVAL_FILL[status] ?? "#94a3b8",
    }));
  }, [periodCampaigns]);

  // 4. Volume vs Rate Scatter
  const scatterData = React.useMemo(
    () =>
      campaignSummaries
        .map((s) => {
          const c = campaignMap.get(s.campaignId);
          const total = s.delivered + s.sent + s.failed + s.pending;
          const rate = total > 0 ? Math.round((s.delivered / total) * 1000) / 10 : 0;
          return {
            recipients: c?.recipientCount ?? 0,
            rate,
            campaign: c?.name ?? s.campaignId.slice(0, 8),
          };
        })
        .filter((d) => d.recipients > 0),
    [campaignSummaries, campaignMap]
  );

  // 5. Campaign Creators
  const creatorsData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of periodCampaigns) {
      const name = c.creatorName ?? c.createdBy;
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([creator, campaigns]) => ({ creator, campaigns }))
      .sort((a, b) => b.campaigns - a.campaigns);
  }, [periodCampaigns]);

  // 6. Message Stages Funnel
  const funnelData = React.useMemo(() => {
    const totalRecipients = periodCampaigns.reduce((s, c) => s + (c.recipientCount ?? 0), 0);
    const totalDispatched = campaignSummaries.reduce(
      (s, p) => s + p.sent + p.delivered + p.failed + p.pending,
      0
    );
    const totalDelivered = campaignSummaries.reduce((s, p) => s + p.delivered, 0);
    return [
      { name: "Contacts in Groups",   value: totalRecipients, fill: "#bb7a30" },
      { name: "Messages Dispatched",  value: totalDispatched, fill: "#ed9634" },
      { name: "Delivered",            value: totalDelivered,  fill: "#22c55e" },
    ].filter((d) => d.value > 0);
  }, [periodCampaigns, campaignSummaries]);

  const funnelTotal = funnelData[0]?.value ?? 1;
  const funnelWithPct = funnelData.map((d) => ({
    ...d,
    pct: Math.round((d.value / funnelTotal) * 100),
  }));

  // 7. Template Usage
  const templateData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of periodCampaigns) {
      if (!c.templateId) continue;
      const name = templateNameMap.get(c.templateId) ?? `Template ${c.templateId.slice(0, 6)}`;
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([template, count]) => ({ template, count }))
      .sort((a, b) => b.count - a.count);
  }, [periodCampaigns, templateNameMap]);

  // 8. Contact Groups by Size (replaces Contact Group Reach treemap)
  const groupTreeData = React.useMemo(
    () =>
      [...groups]
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 8)
        .map((g, i) => ({ name: g.name, value: g.memberCount, fill: TREE_FILLS[i % TREE_FILLS.length] })),
    [groups]
  );

  // 9. Scheduled & Reminder Campaign Status (replaces Reminder Pipeline)
  const scheduledStatusData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of periodCampaigns) {
      if (c.kind !== "SCHEDULED" && c.kind !== "REMINDER") continue;
      const label = SCHEDULED_STATUS_LABEL[c.status] ?? c.status;
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [periodCampaigns]);

  return (
    <>
      {/* 1. Campaign Delivery Performance */}
      <FadeIn>
        {(inView) => (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Delivery Performance</CardTitle>
              <CardDescription>Delivered vs failed messages per campaign</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <ChartSkeleton />
              ) : (
                <ChartContainer key={inView ? 1 : 0} config={campaignDeliveryConfig} className="h-64 w-full">
                  <BarChart data={deliveryData} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={fmtK} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={140} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="delivered" fill="var(--color-delivered)" stackId="a" />
                    <Bar dataKey="failed" fill="var(--color-failed)" stackId="a" radius={[0, 4, 4, 0]} />
                    <ChartLegend content={<ChartLegendContent />} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        )}
      </FadeIn>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 2. Delivery Rate by Type */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Delivery Rate by Campaign Type</CardTitle>
                <CardDescription>Average delivery rate across campaign kinds</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={typeRateConfig} className="h-52 w-full">
                    <BarChart data={typeRateData} margin={{ left: 12, right: 24 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="type" tickLine={false} axisLine={false} />
                      <YAxis
                        domain={[0, 100]}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent formatter={(v) => [`${v}%`, "Delivery Rate"]} />
                        }
                      />
                      <Bar dataKey="rate" fill="var(--color-rate)" radius={4}>
                        <LabelList
                          dataKey="rate"
                          position="top"
                          formatter={(v) => `${v}%`}
                          className="text-[10px]"
                        />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 3. Approval Pipeline */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Approval Pipeline</CardTitle>
                <CardDescription>
                  Campaign approval status in the last {periodLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={approvalConfig} className="h-52 w-full">
                    <PieChart>
                      <Pie
                        data={approvalData}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                      >
                        {approvalData.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                      <ChartLegend
                        content={
                          <ChartLegendContent nameKey="status" className="pt-3 justify-center gap-x-4" />
                        }
                      />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 4. Volume vs Rate Scatter */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Volume vs Delivery Rate</CardTitle>
                <CardDescription>Recipients vs delivery rate per campaign</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer
                    key={inView ? 1 : 0}
                    config={{ campaigns: { label: "Campaigns", color: "var(--primary)" } }}
                    className="h-52 w-full"
                  >
                    <ScatterChart margin={{ left: 12, right: 12 }}>
                      <CartesianGrid />
                      <XAxis
                        dataKey="recipients"
                        name="Recipients"
                        tickFormatter={fmtK}
                        tickLine={false}
                        axisLine={false}
                        label={{ value: "Recipients", position: "insideBottom", offset: -4, fontSize: 11 }}
                      />
                      <YAxis
                        dataKey="rate"
                        name="Rate %"
                        domain={[0, 100]}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(val, name) => [
                              name === "rate" ? `${val}%` : fmtK(val as number),
                              name === "rate" ? "Delivery Rate" : "Recipients",
                            ]}
                          />
                        }
                      />
                      <Scatter data={scatterData} fill="var(--color-campaigns)" opacity={0.8} />
                    </ScatterChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 5. Campaign Creators */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Campaign Creators</CardTitle>
                <CardDescription>
                  Campaigns created per user in the last {periodLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={creatorConfig} className="h-52 w-full">
                    <BarChart data={creatorsData} layout="vertical" margin={{ left: 12, right: 24 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis dataKey="creator" type="category" tickLine={false} axisLine={false} width={120} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="campaigns" fill="var(--color-campaigns)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>
      </div>

      {/* 6. Message Stages Funnel */}
      <FadeIn>
        {(inView) => (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Message Stages</CardTitle>
              <CardDescription>
                From contact groups through delivery in the last {periodLabel.toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <ChartSkeleton />
              ) : (
                <ChartContainer key={inView ? 1 : 0} config={funnelBarConfig} className="h-52 w-full">
                  <BarChart data={funnelWithPct} layout="vertical" margin={{ left: 12, right: 48 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtK} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={160} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent formatter={(v) => [fmtK(v as number), "Messages"]} />
                      }
                    />
                    <Bar dataKey="value" radius={4}>
                      {funnelWithPct.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="pct"
                        position="right"
                        formatter={(v) => `${v}%`}
                        className="text-[11px]"
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        )}
      </FadeIn>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 7. Template Usage */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Template Usage</CardTitle>
                <CardDescription>
                  Campaigns per template in the last {periodLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={templateUsageConfig} className="h-52 w-full">
                    <BarChart data={templateData} layout="vertical" margin={{ left: 12, right: 24 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis dataKey="template" type="category" tickLine={false} axisLine={false} width={130} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 8. Contact Groups by Size (replaces Contact Group Reach treemap) */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Contact Groups by Size</CardTitle>
                <CardDescription>Largest contact groups available</CardDescription>
              </CardHeader>
              <CardContent className="pb-0">
                <ChartContainer
                  key={inView ? 1 : 0}
                  config={{ size: { label: "Members" } }}
                  className="h-52 w-full"
                >
                  <Treemap data={groupTreeData} dataKey="value" aspectRatio={4 / 3}>
                    {groupTreeData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Treemap>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 9. Scheduled & Reminder Campaign Status (replaces Reminder Pipeline) */}
        <FadeIn>
          {(inView) => (
            <Card className="col-span-full">
              <CardHeader>
                <CardTitle>Scheduled & Reminder Campaigns</CardTitle>
                <CardDescription>
                  Status of time-based campaigns in the last {periodLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer
                    key={inView ? 1 : 0}
                    config={scheduledCampaignConfig}
                    className="h-52 w-full"
                  >
                    <BarChart data={scheduledStatusData} margin={{ left: 12, right: 24 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="status" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>
      </div>
    </>
  );
}
