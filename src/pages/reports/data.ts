import type { ChartConfig } from "@/components/ui/chart";

// ─── Period options ───────────────────────────────────────────────────────────

export const PERIOD_OPTIONS = [
  { label: "1 Month", value: "1m" },
  { label: "3 Months", value: "3m" },
  { label: "6 Months", value: "6m" },
  { label: "1 Year", value: "1y" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function periodToDates(period: string): { from: string; to: string } {
  const daysMap: Record<string, number> = { "1m": 30, "3m": 90, "6m": 180, "1y": 365 };
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (daysMap[period] ?? 90));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function periodToDays(period: string): number {
  return ({ "1m": 30, "3m": 90, "6m": 180, "1y": 365 } as Record<string, number>)[period] ?? 90;
}

export function fmtDate(value: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString("en-US", opts);
}

export function fmtK(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

export const LEGEND_2COL = "flex-wrap gap-x-6 gap-y-2 pt-3 *:basis-[45%] *:justify-start";

// ─── Chart configs ────────────────────────────────────────────────────────────

export const messagesChartConfig = {
  views:  { label: "Messages" },
  sent:   { label: "Sent",   color: "var(--primary)" },
  failed: { label: "Failed", color: "#cd3906" },
} satisfies ChartConfig;

export const cumulativeConfig = {
  total: { label: "Cumulative Messages", color: "var(--primary)" },
} satisfies ChartConfig;

export const deliveryRateConfig = {
  rate: { label: "Delivery Rate (%)", color: "var(--primary)" },
} satisfies ChartConfig;

// Replaces errorLogConfig — shows actual message status breakdown from backend
export const messageStatusConfig = {
  value:     { label: "Messages" },
  DELIVERED: { label: "Delivered", color: "#22c55e" },
  SENT:      { label: "Sent",      color: "#3b82f6" },
  QUEUED:    { label: "Queued",    color: "#a78bfa" },
  PENDING:   { label: "Pending",   color: "#fbbf24" },
  FAILED:    { label: "Failed",    color: "#ef4444" },
  EXPIRED:   { label: "Expired",   color: "#6b7280" },
} satisfies ChartConfig;

export const campaignReachConfig = {
  reach: { label: "Recipients", color: "var(--secondary)" },
} satisfies ChartConfig;

export const campaignTypeConfig = {
  count:     { label: "Campaigns" },
  Instant:   { label: "Instant",   color: "var(--primary)" },
  Scheduled: { label: "Scheduled", color: "var(--secondary)" },
  Reminder:  { label: "Reminder",  color: "#ed9634" },
} satisfies ChartConfig;

// Updated: no Rejected — backend has no REJECTED status
export const campaignStatusConfig = {
  count:     { label: "Campaigns" },
  Draft:     { label: "Draft",      color: "#bb7a30" },
  Pending:   { label: "Pending",    color: "#ed9634" },
  Approved:  { label: "Approved",   color: "#3b82f6" },
  Completed: { label: "Completed",  color: "#22c55e" },
  Cancelled: { label: "Cancelled",  color: "#ef4444" },
} satisfies ChartConfig;

export const campaignDeliveryConfig = {
  delivered: { label: "Delivered",     color: "var(--primary)" },
  failed:    { label: "Failed",        color: "#cd3906" },
  rate:      { label: "Delivery Rate", color: "var(--secondary)" },
} satisfies ChartConfig;

export const typeRateConfig = {
  rate: { label: "Avg Delivery Rate (%)", color: "var(--primary)" },
} satisfies ChartConfig;

// Updated: Rejected → Cancelled
export const approvalConfig = {
  count:     { label: "Campaigns" },
  Pending:   { label: "Pending",   color: "#ed9634" },
  Approved:  { label: "Approved",  color: "#22c55e" },
  Cancelled: { label: "Cancelled", color: "#ef4444" },
} satisfies ChartConfig;

export const funnelBarConfig = {
  value: { label: "Messages", color: "var(--primary)" },
} satisfies ChartConfig;

export const creatorConfig = {
  campaigns: { label: "Campaigns Created", color: "var(--secondary)" },
} satisfies ChartConfig;

export const templateUsageConfig = {
  count: { label: "Campaigns Used", color: "#ceb847" },
} satisfies ChartConfig;

// Replaces reminderConfig — shows scheduled/reminder campaign status breakdown
export const scheduledCampaignConfig = {
  count: { label: "Campaigns", color: "var(--primary)" },
} satisfies ChartConfig;

export const userDeptConfig = {
  users: { label: "Users", color: "var(--secondary)" },
} satisfies ChartConfig;

export const userStatusConfig = {
  count:    { label: "Users" },
  Active:   { label: "Active",   color: "#ceb847" },
  Inactive: { label: "Inactive", color: "#78542e" },
} satisfies ChartConfig;

// Replaces loginTrendConfig — shows user activity by action type from backend
export const userActivityConfig = {
  total: { label: "Count", color: "var(--primary)" },
} satisfies ChartConfig;

// Replaces privilegeConfig — shows user login recency buckets
export const loginRecencyConfig = {
  count: { label: "Users", color: "#ed9634" },
} satisfies ChartConfig;

// Replaces privDistConfig — shows users bucketed by workspace membership count
export const membershipDistConfig = {
  users: { label: "Users", color: "var(--secondary)" },
} satisfies ChartConfig;

// Replaces radarConfig — shows new accounts created per month
export const userTrendConfig = {
  users: { label: "New Users", color: "var(--primary)" },
} satisfies ChartConfig;
