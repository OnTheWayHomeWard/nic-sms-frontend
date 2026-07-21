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
import { workspacesApi } from "@/lib/services";
import type { ApiWorkspaceMember } from "@/lib/services";
import { useAuth } from "@/contexts/AuthContext";

function roleBadgeClass(role: string) {
  if (role === "DEPT_HEAD") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  if (role === "OPERATOR")  return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400";
  return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400";
}

function roleLabel(role: string) {
  if (role === "DEPT_HEAD") return "Admin";
  if (role === "OPERATOR")  return "Operator";
  return "Viewer";
}

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function WorkspaceUsersTable() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [members, setMembers]   = React.useState<ApiWorkspaceMember[]>([]);
  const [loading, setLoading]   = React.useState(true);

  React.useEffect(() => {
    const wsId = user?.workspaceId;
    if (!wsId) { setLoading(false); return; }
    workspacesApi
      .members(wsId)
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.workspaceId]);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Workspace Users</CardTitle>
        <CardDescription>Current users in this workspace</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-5 w-14 rounded-sm shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
            ))
          : members.length === 0
          ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {user?.workspaceId ? "No members found." : "No workspace context."}
            </p>
          )
          : members.slice(0, 6).map((m) => (
              <div key={m.userId} className="flex items-start gap-3">
                <Badge
                  variant="outline"
                  className={`rounded-sm border-0 text-[10px] shrink-0 ${roleBadgeClass(m.role)}`}
                >
                  {roleLabel(m.role)}
                </Badge>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{m.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.username}{m.assignedAt ? ` • ${fmtDate(m.assignedAt)}` : ""}
                  </p>
                </div>
              </div>
            ))
        }
        <div className="pt-6 text-center">
          <Button
            variant="ghost"
            className="h-auto p-0 text-sm gap-1 hover:bg-transparent hover:underline hover:underline-offset-2 cursor-pointer"
            onClick={() => navigate("/user-management")}
          >
            User Management
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
