"use client";

import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessRoute } from "@/lib/permissions";

import {
  LayoutGrid,
  MessageSquare,
  FileEdit,
  Upload,
  Contact,
  Users,
  LineChart,
  Bell,
  House,
  Activity,
  Settings,
} from "lucide-react";
import logo from "../assets/image.png";

const ALL_NAV = [
  { title: "Dashboard",          url: "/dashboard",       icon: <LayoutGrid /> },
  { title: "Workspaces",         url: "/workspaces",      icon: <House /> },
  { title: "Reminder",           url: "/reminder",        icon: <Bell /> },
  { title: "New Campaign",       url: "/campaigns/new",   icon: <MessageSquare /> },
  { title: "All Users",          url: "/all-users",       icon: <Users /> },
  { title: "Templates",          url: "/templates",       icon: <FileEdit /> },
  { title: "Campaign Management",url: "/campaigns",       icon: <Upload /> },
  { title: "Contact Management", url: "/contacts",        icon: <Contact /> },
  { title: "User Management",    url: "/user-management", icon: <Users /> },
  { title: "Audit Logs",         url: "/audit-logs",      icon: <Activity /> },
  { title: "Reports",            url: "/reports",         icon: <LineChart /> },
  { title: "System Settings",    url: "/system-settings", icon: <Settings /> },
];

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onLogout?: () => void;
}

export function AppSidebar({ onLogout, ...props }: AppSidebarProps) {
  const { user, rolePermissions, workspacePermissions } = useAuth();

  const navItems = React.useMemo(() => {
    if (!user) return [];
    // Single source of truth: a link shows only when the role's actual
    // permissions grant the page AND the workspace enables its feature.
    return ALL_NAV.filter((item) =>
      canAccessRoute(user.role, rolePermissions, workspacePermissions, item.url),
    );
  }, [user, rolePermissions, workspacePermissions]);

  const navUser = {
    name: user?.displayName ?? user?.username ?? "—",
    username: user?.username ?? "",
    email: user?.email ?? "",
    avatar: "",
  };

  // The nav group label shows the signed-in user's context, in Title Case:
  // workspace name, then its branch/division (if any), then the role — e.g.
  // "Underwriting · Royal Branch · Admin". A super admin has no workspace, so
  // they get the platform label instead.
  const ROLE_LABEL: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    DEPT_HEAD: "Admin",
    CEO: "Delegate",
    OPERATOR: "Operator",
    VIEWER: "Viewer",
  };
  const titleCase = (s: string) =>
    s.replace(/\b\w/g, (ch) => ch.toUpperCase());
  const roleLabel = user?.role ? ROLE_LABEL[user.role] ?? user.role : "";
  const navLabel =
    user?.role === "SUPER_ADMIN"
      ? "Platform · Super Admin"
      : [
          user?.workspaceName ? titleCase(user.workspaceName) : null,
          user?.division ? titleCase(user.division) : null,
          roleLabel || null,
        ]
          .filter(Boolean)
          .join(" · ") || "Workspace";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<div className="flex items-center gap-2 cursor-default select-none" />}
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted shrink-0">
                <img src={logo} alt="NIC" className="size-6 object-contain" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Nib Insurance S.C</span>
                <span className="truncate text-xs text-muted-foreground">NIC eSMS Platform</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent data-guide="app-nav">
        <NavMain items={navItems} label={navLabel} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={navUser} onLogout={onLogout} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
