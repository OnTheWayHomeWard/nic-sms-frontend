"use client";

import * as React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ModeToggle } from "./components/mode-toggle";
import { PageGuideButton } from "./components/page-guide";
import { forceRefresh, TOKEN_STORAGE_KEY } from "@/lib/api";
import { useAuth } from "./contexts/AuthContext";
import { canAccessRoute, FEATURE_GATE } from "./lib/permissions";
import AllUsersPage from "./pages/AllUsersPage";
import CampaignPage from "./pages/CampaignPage";
import ComposePage from "./pages/ComposePage";
import ReminderPage from "./pages/ReminderPage";
import TemplatePage from "./pages/TemplatePage";
import ReportsPage from "./pages/ReportsPage";
import LoginPage from "./pages/LoginPage";
import { Toaster } from "@/components/ui/sonner";
import DashboardPage from "./pages/DashboardPage";
import WorkspacesPage from "./pages/WorkspacePage";
import AuditLogsPage from "./pages/AuditLogsPage";
import SystemSettingsPage from "./pages/SystemSettingsPage";
import ContactManagementPage from "./pages/ContactManagementPage";
import UserManagementPage from "./pages/UserManagementPage";

// ─── Idle logout ─────────────────────────────────────────────────────────────
// Tracks the JWT's own exp claim — the same counter the backend uses.
// Activity that triggers API calls refreshes the token (and thus exp).
// "Stay signed in" forces an immediate refresh.

const WARN_BEFORE_MS = 60 * 1000; // show dialog 60 s before token expiry

function getTokenExpMs(): number | null {
  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return null;
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function IdleLogoutWarning({ onLogout }: { onLogout: () => void }) {
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const onLogoutRef = React.useRef(onLogout);
  React.useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);

  // True from the moment "Stay signed in" is pressed until the token refresh
  // settles. forceRefresh() is async, so without this the 500 ms poll fires in
  // between, still reads the OLD (near-expiry) token, and re-shows the dialog
  // for a frame before the new token lands — the brief second-popup flash.
  const refreshingRef = React.useRef(false);

  const staySignedIn = React.useCallback(() => {
    setSecondsLeft(null);
    refreshingRef.current = true;
    forceRefresh()
      .catch(() => {})
      .finally(() => { refreshingRef.current = false; });
  }, []);

  React.useEffect(() => {
    const id = setInterval(() => {
      // Hold the dialog closed while a refresh is in flight — the stale token
      // still looks expiring until the new one is stored.
      if (refreshingRef.current) return;
      const exp = getTokenExpMs();
      if (exp === null) return;
      const remaining = exp - Date.now();
      if (remaining <= 0) {
        toast.warning("You were signed out because your session expired.", {
          duration: 8000,
        });
        onLogoutRef.current();
        return;
      }
      if (remaining <= WARN_BEFORE_MS) {
        setSecondsLeft(Math.ceil(remaining / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 500);
    return () => clearInterval(id);
  }, []); // intentionally no deps — uses refs

  if (secondsLeft === null) return null;

  const progress = Math.round((secondsLeft / (WARN_BEFORE_MS / 1000)) * 100);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) staySignedIn(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Session expiring</DialogTitle>
          <DialogDescription>
            Your session will expire in{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {secondsLeft}s
            </span>
            . Sign in again to continue.
          </DialogDescription>
        </DialogHeader>
        <Progress value={progress} className="h-1.5" />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onLogoutRef.current()}>
            Sign out now
          </Button>
          <Button size="sm" onClick={staySignedIn}>
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Route guard ─────────────────────────────────────────────────────────────

// Guards a route with the same canAccessRoute logic the sidebar uses, so a URL
// can never be reached by typing it when the nav would hide it. Access is the
// intersection of the role's actual backend permissions and the workspace's
// feature flags (SUPER_ADMIN bypasses). Feature-gated routes wait for the
// workspace permissions to load before deciding, to avoid a premature redirect
// on a hard reload directly onto the URL.
function ProtectedRoute({ path, children }: { path: string; children: React.ReactElement }) {
  const { user, rolePermissions, workspacePermissions, permissionsReady } = useAuth();
  if (!user) return <Navigate to="/dashboard" replace />;

  if (FEATURE_GATE[path] && user.role !== "SUPER_ADMIN" && !permissionsReady) {
    return pageSkeleton(path);
  }
  if (!canAccessRoute(user.role, rolePermissions, workspacePermissions, path)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

// ─── Page-specific skeletons ───────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 animate-in fade-in duration-150">
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <Skeleton className="aspect-video rounded-xl" />
        <div className="aspect-video rounded-xl border p-4 flex flex-col justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-36" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <Skeleton className="aspect-video rounded-xl" />
      </div>
      <div className="rounded-xl border overflow-hidden">
        <div className="border-b px-4 py-3 grid grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 grid grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, j) => (
              <Skeleton key={j} className="h-4 rounded" />
            ))}
          </div>
        ))}
        <div className="px-4 py-3 flex justify-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function ReminderSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-40 shrink-0" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="rounded-lg border">
        <div className="grid grid-cols-[2fr_1fr] divide-x">
          <div className="divide-y">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="size-4 rounded mt-0.5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Skeleton className="size-4 rounded" />
                    <Skeleton className="size-4 rounded" />
                  </div>
                </div>
                <Skeleton className="h-14 w-full rounded-md" />
                {i !== 1 && <Skeleton className="h-9 w-full rounded-md" />}
              </div>
            ))}
          </div>
          <div className="p-4 space-y-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-44 w-full rounded-lg" />
          </div>
        </div>
        <div className="p-4 pt-8">
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

function TemplatesSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-40 shrink-0" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <div className="space-y-1">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-16 w-full rounded-md" />
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-8 w-40 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComposeSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4 animate-in fade-in duration-150">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="rounded-xl border p-4 sm:p-6 space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="grid grid-cols-2 divide-x">
          <div className="pr-8 space-y-4">
            <div className="space-y-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-6 w-44 rounded-full" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
          <div className="pl-8 space-y-4">
            <div className="space-y-1">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-6 w-36 rounded-full" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-3">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-44 rounded-full" />
        </div>
        <Skeleton className="h-px w-full" />
        <div className="space-y-3">
          <div className="space-y-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
        <div className="flex justify-end pt-2">
          <Skeleton className="h-11 w-40 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function CampaignsSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-36 shrink-0" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 min-w-52 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted border-b px-4 py-2.5 grid grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 grid grid-cols-8 gap-4 items-center">
            <Skeleton className="h-4 w-40 rounded col-span-2" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-14 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
            <div className="flex justify-end gap-1">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          </div>
        ))}
        <div className="px-4 py-3 flex justify-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function AllUsersSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 min-w-52 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted border-b px-4 py-2.5 grid grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 grid grid-cols-7 gap-4 items-center">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full shrink-0" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <Skeleton className="h-4 rounded" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-4 w-24 rounded" />
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
        ))}
        <div className="px-4 py-3 flex justify-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-36 shrink-0" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex flex-wrap gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-1 min-w-52 rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded-sm" />
            </div>
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-52 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-60 w-full rounded-lg" />
      </div>
    </div>
  );
}

function WorkspacesSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-1">
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted border-b px-4 py-2.5 grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 grid grid-cols-5 gap-4 items-center">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-4 w-20 rounded" />
            <div className="flex justify-end gap-1">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          </div>
        ))}
        <div className="px-4 py-3 flex justify-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function ContactsSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 shrink-0" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 min-w-52 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted border-b px-4 py-2.5 grid grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 grid grid-cols-6 gap-4 items-center">
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
            <div className="flex gap-1">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          </div>
        ))}
        <div className="px-4 py-3 flex justify-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function UserManagementSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-24 shrink-0" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 min-w-48 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted border-b px-4 py-2.5 grid grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 grid grid-cols-7 gap-4 items-center">
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-28 rounded" />
            <div className="flex justify-end gap-1">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          </div>
        ))}
        <div className="px-4 py-3 flex justify-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function AuditLogsSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md shrink-0" />
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted border-b px-4 py-2.5 grid grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b px-4 py-3 grid grid-cols-7 gap-4 items-center">
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-5 w-14 rounded-md" />
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
            <div className="flex justify-center">
              <Skeleton className="size-7 rounded-md" />
            </div>
          </div>
        ))}
        <div className="px-4 py-3 flex justify-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function SystemSettingsSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="space-y-2">
        <Skeleton className="h-7 w-60" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-1">
        <Skeleton className="h-9 w-48 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
      <div className="grid gap-x-9 gap-y-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full rounded-md" />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-11 w-32 rounded-md" />
      </div>
    </div>
  );
}

function pageSkeleton(path: string) {
  if (path === "/campaigns/new") return <ComposeSkeleton />;
  if (path.startsWith("/campaigns")) return <CampaignsSkeleton />;
  if (path === "/reminder") return <ReminderSkeleton />;
  if (path === "/templates") return <TemplatesSkeleton />;
  if (path === "/all-users") return <AllUsersSkeleton />;
  if (path === "/contacts") return <ContactsSkeleton />;
  if (path === "/user-management") return <UserManagementSkeleton />;
  if (path === "/audit-logs") return <AuditLogsSkeleton />;
  if (path === "/reports") return <ReportsSkeleton />;
  if (path === "/workspaces") return <WorkspacesSkeleton />;
  if (path === "/system-settings") return <SystemSettingsSkeleton />;
  return <DashboardSkeleton />;
}

// ─── Authenticated layout ─────────────────────────────────────────────────────

function AppLayout({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [stableLocation, setStableLocation] = React.useState(location);
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setIsTransitioning(true);
    const timer = window.setTimeout(() => {
      setStableLocation(location);
      setIsTransitioning(false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  return (
    <SidebarProvider>
      <AppSidebar onLogout={onLogout} />
      <SidebarInset>
        <header className="flex sticky top-0 h-16 pr-8 py-8 justify-between shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="m-2 data-[orientation=vertical]:h-4"
            />
          </div>
          <div className="flex items-center gap-1">
            <PageGuideButton />
            <ModeToggle />
          </div>
        </header>
        <div
          key={isTransitioning ? `__skeleton__${location.pathname}` : stableLocation.pathname}
          className="animate-in fade-in duration-200"
        >
          {isTransitioning ? (
            pageSkeleton(location.pathname)
          ) : (
            <Routes location={stableLocation}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ProtectedRoute path="/dashboard"><DashboardPage /></ProtectedRoute>} />
              <Route path="/campaigns" element={<ProtectedRoute path="/campaigns"><CampaignPage /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute path="/reports"><ReportsPage /></ProtectedRoute>} />
              <Route path="/reminder" element={<ProtectedRoute path="/reminder"><ReminderPage /></ProtectedRoute>} />
              <Route path="/campaigns/new" element={<ProtectedRoute path="/campaigns/new"><ComposePage /></ProtectedRoute>} />
              <Route path="/templates" element={<ProtectedRoute path="/templates"><TemplatePage /></ProtectedRoute>} />
              <Route path="/contacts" element={<ProtectedRoute path="/contacts"><ContactManagementPage /></ProtectedRoute>} />
              <Route path="/user-management" element={<ProtectedRoute path="/user-management"><UserManagementPage /></ProtectedRoute>} />
              <Route path="/audit-logs" element={<ProtectedRoute path="/audit-logs"><AuditLogsPage /></ProtectedRoute>} />
              <Route path="/workspaces" element={<ProtectedRoute path="/workspaces"><WorkspacesPage /></ProtectedRoute>} />
              <Route path="/all-users" element={<ProtectedRoute path="/all-users"><AllUsersPage /></ProtectedRoute>} />
              <Route path="/system-settings" element={<ProtectedRoute path="/system-settings"><SystemSettingsPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// ─── No-workspace screen ────────────────────────────────────────────────────
// Shown to an authenticated, non-SUPER_ADMIN user who has no workspace
// membership (and therefore no role). They can sign in but have nothing to
// access until an administrator adds them to a workspace.
function NoWorkspaceScreen({
  onLogout,
  displayName,
}: {
  onLogout: () => void;
  displayName?: string;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Building2 className="size-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">No workspace assigned</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {displayName ? `Hi ${displayName}, your` : "Your"} account isn’t part of
          any workspace and hasn’t been assigned a role yet. Please contact your
          administrator to get access.
        </p>
        <Button variant="outline" className="mt-6" onClick={onLogout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

// ─── Workspace deactivated screen ──────────────────────────────────────────
// Shown the instant the backend rejects a request because this user's
// workspace was suspended (see JwtAuthenticationFilter + api.ts's
// "workspace:deactivated" event) — mid-session, not just on next login.
function WorkspaceDeactivatedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <Building2 className="size-6 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">Workspace deactivated</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your workspace has been deactivated. Contact your administrator for
          access.
        </p>
        <Button variant="outline" className="mt-6" onClick={onLogout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { isAuthenticated, user, logout, workspaceDeactivated } = useAuth();

  if (!isAuthenticated) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <LoginPage />
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{ classNames: { title: "font-semibold" } }}
        />
      </ThemeProvider>
    );
  }

  if (workspaceDeactivated) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <WorkspaceDeactivatedScreen onLogout={logout} />
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{ classNames: { title: "font-semibold" } }}
        />
      </ThemeProvider>
    );
  }

  // A non-SUPER_ADMIN with no current workspace has no membership (hence no
  // role). SUPER_ADMIN is a platform role with no workspace and is unaffected.
  const noWorkspace = !!user && user.role !== "SUPER_ADMIN" && !user.workspaceId;
  if (noWorkspace) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <NoWorkspaceScreen onLogout={logout} displayName={user?.displayName} />
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{ classNames: { title: "font-semibold" } }}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AppLayout onLogout={logout} />
      <IdleLogoutWarning onLogout={logout} />
      <Toaster
        position="bottom-right"
        richColors
        toastOptions={{ classNames: { title: "font-semibold" } }}
      />
    </ThemeProvider>
  );
}
