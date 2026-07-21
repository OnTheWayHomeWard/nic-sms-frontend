"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
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
  LEGEND_2COL,
  loginRecencyConfig,
  membershipDistConfig,
  userActivityConfig,
  userDeptConfig,
  userStatusConfig,
  userTrendConfig,
  periodToDays,
} from "./data";
import type { ApiUser, ApiWorkspace, DashboardSummary, UserActivityPoint } from "@/lib/services";
import { usersApi, workspacesApi, reportsApi } from "@/lib/services";
import { useAuth } from "@/contexts/AuthContext";
import { atLeast } from "@/lib/permissions";

interface UsersTabProps {
  period: string;
  periodLabel: string;
  summary: DashboardSummary | null;
  workspaceId?: string;
}

function ChartSkeleton() {
  return (
    <div className="p-6">
      <Skeleton className="h-52 w-full rounded-lg" />
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  DEPT_HEAD:   "Admin",
  OPERATOR:    "Operator",
  VIEWER:      "Viewer",
};

const ROLE_FILL: Record<string, string> = {
  "Super Admin": "var(--primary)",
  Admin:         "#3b82f6",
  Operator:      "#ed9634",
  Viewer:        "#bb7a30",
};

export function UsersTab({ period, periodLabel, summary, workspaceId }: UsersTabProps) {
  const { user } = useAuth();
  const isSuperAdmin = atLeast(user?.role, "SUPER_ADMIN");

  const [users, setUsers]               = React.useState<ApiUser[]>([]);
  const [workspaces, setWorkspaces]     = React.useState<ApiWorkspace[]>([]);
  const [usersActivity, setActivity]    = React.useState<UserActivityPoint[]>([]);
  const [loadingUsers, setLoadingUsers] = React.useState(true);

  React.useEffect(() => {
    setLoadingUsers(true);
    const tasks: Promise<unknown>[] = [
      usersApi.list().then(setUsers).catch(() => {}),
    ];
    if (isSuperAdmin) {
      tasks.push(workspacesApi.list().then(setWorkspaces).catch(() => {}));
    }
    Promise.all(tasks).finally(() => setLoadingUsers(false));
  }, [isSuperAdmin]);

  React.useEffect(() => {
    const days = periodToDays(period);
    reportsApi.usersActivity(days, workspaceId).then(setActivity).catch(() => {});
  }, [period, workspaceId]);

  // Chart 1: User Role Distribution (radial bar)
  const roleData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      const label = ROLE_LABEL[u.primaryRole ?? ""] ?? (u.primaryRole ?? "Unknown");
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, fill: ROLE_FILL[name] ?? "#94a3b8" }))
      .sort((a, b) => b.count - a.count);
  }, [users]);

  const roleConfig = React.useMemo(() => {
    const cfg: Record<string, { label: string; color?: string }> = { count: { label: "Users" } };
    for (const d of roleData) cfg[d.name] = { label: d.name, color: d.fill };
    return cfg;
  }, [roleData]);

  // Chart 2: Users by Workspace
  const workspaceData = React.useMemo(
    () =>
      workspaces
        .map((ws) => ({ workspace: ws.name, users: ws.memberCount }))
        .sort((a, b) => b.users - a.users),
    [workspaces]
  );

  // Chart 3: User Activity Status
  const activeCount  = summary?.activeUsers30d ?? 0;
  const totalUsers   = summary?.totalUsers ?? users.length;
  const userStatusData = [
    { status: "Active",   count: activeCount,                              fill: "#ceb847" },
    { status: "Inactive", count: Math.max(0, totalUsers - activeCount),    fill: "#78542e" },
  ].filter((d) => d.count > 0);

  // Chart 4: User Activity by Action (replaces login trend line)
  const activityData = React.useMemo(
    () =>
      [...usersActivity]
        .sort((a, b) => b.total - a.total)
        .map((pt) => ({
          action: pt.action
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          total: pt.total,
        })),
    [usersActivity]
  );

  // Chart 5: User Login Recency (replaces Privilege Coverage)
  const loginRecencyData = React.useMemo(() => {
    const now = Date.now();
    const buckets: Record<string, number> = {
      "Last 7 days": 0,
      "7–30 days":   0,
      "30–90 days":  0,
      "90+ days":    0,
      "Never":       0,
    };
    for (const u of users) {
      if (!u.lastLoginAt) { buckets["Never"]++; continue; }
      const days = (now - new Date(u.lastLoginAt).getTime()) / 86_400_000;
      if      (days <= 7)  buckets["Last 7 days"]++;
      else if (days <= 30) buckets["7–30 days"]++;
      else if (days <= 90) buckets["30–90 days"]++;
      else                 buckets["90+ days"]++;
    }
    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
  }, [users]);

  // Chart 6: User Workspace Memberships (replaces Access Concentration)
  const membershipData = React.useMemo(() => {
    const buckets: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4+": 0 };
    for (const u of users) {
      const len = u.memberships.length;
      const key = len >= 4 ? "4+" : String(len);
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    return Object.entries(buckets).map(([count, users]) => ({ count, users }));
  }, [users]);

  // Chart 7: User Account Growth (replaces Role Privilege Radar)
  const userGrowthData = React.useMemo(() => {
    const months = Math.max(1, Math.floor(periodToDays(period) / 30));
    const now = new Date();
    return Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const count = users.filter((u) => {
        if (!u.createdAt) return false;
        const created = new Date(u.createdAt);
        return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
      }).length;
      return { month: label, users: count };
    });
  }, [users, period]);

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 1. User Role Distribution */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>User Role Distribution</CardTitle>
                <CardDescription>Users grouped by primary role</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={roleConfig} className="h-52 w-full">
                    <RadialBarChart data={roleData} innerRadius={30} outerRadius={90}>
                      <RadialBar dataKey="count" background>
                        {roleData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </RadialBar>
                      <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                      <ChartLegend
                        content={<ChartLegendContent nameKey="name" className={LEGEND_2COL} />}
                      />
                    </RadialBarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 2. Users by Workspace */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>Users by Workspace</CardTitle>
                <CardDescription>Member count per workspace</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={userDeptConfig} className="h-52 w-full">
                    <BarChart data={workspaceData} layout="vertical" margin={{ left: 12, right: 24 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                      <YAxis
                        dataKey="workspace"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        width={110}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="users" fill="var(--color-users)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 3. User Activity Status */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>User Activity Status</CardTitle>
                <CardDescription>Active (last 30 days) vs inactive users</CardDescription>
              </CardHeader>
              <CardContent>
                {summary === null ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={userStatusConfig} className="h-52 w-full">
                    <PieChart>
                      <Pie
                        data={userStatusData}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                      >
                        {userStatusData.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                      <ChartLegend
                        content={
                          <ChartLegendContent nameKey="status" className="pt-3 justify-center gap-x-6" />
                        }
                      />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 4. User Activity by Action (replaces login trend line) */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>User Activity by Action</CardTitle>
                <CardDescription>
                  Action counts in the last {periodLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer key={inView ? 1 : 0} config={userActivityConfig} className="h-52 w-full">
                  <BarChart data={activityData} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis dataKey="action" type="category" tickLine={false} axisLine={false} width={140} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </FadeIn>
      </div>

      {/* 5. User Login Recency (replaces Privilege Coverage bar) */}
      <FadeIn>
        {(inView) => (
          <Card>
            <CardHeader>
              <CardTitle>User Login Recency</CardTitle>
              <CardDescription>How recently users have logged in</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <ChartSkeleton />
              ) : (
                <ChartContainer key={inView ? 1 : 0} config={loginRecencyConfig} className="h-52 w-full">
                  <BarChart data={loginRecencyData} margin={{ left: 12, right: 24 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 6. User Workspace Memberships (replaces Access Concentration pie) */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>User Workspace Memberships</CardTitle>
                <CardDescription>Users grouped by number of workspace memberships</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={membershipDistConfig} className="h-52 w-full">
                    <BarChart data={membershipData} margin={{ left: 12, right: 24 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="count"
                        tickLine={false}
                        axisLine={false}
                        label={{ value: "Memberships", position: "insideBottom", offset: -4, fontSize: 11 }}
                      />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="users" fill="var(--color-users)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
        </FadeIn>

        {/* 7. User Account Growth (replaces Role Privilege Radar) */}
        <FadeIn>
          {(inView) => (
            <Card>
              <CardHeader>
                <CardTitle>User Account Growth</CardTitle>
                <CardDescription>
                  New accounts created per month over the last {periodLabel.toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <ChartSkeleton />
                ) : (
                  <ChartContainer key={inView ? 1 : 0} config={userTrendConfig} className="h-52 w-full">
                    <BarChart data={userGrowthData} margin={{ left: 12, right: 24 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="users" fill="var(--color-users)" radius={4} />
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
