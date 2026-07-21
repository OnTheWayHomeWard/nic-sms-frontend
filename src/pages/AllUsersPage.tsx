"use client";

import * as React from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  Plus,
  RotateCcw,
  Search,
  SquarePen,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/tablePagination";
import { TypographyH3, TypographyMuted } from "@/components/ui/typography";
import { Separator } from "@/components/ui/separator";
import { TempFieldHint } from "@/components/ui/temp-field-hint";
import {
  apiErrorMessage,
  codeToUiRole,
  rolesApi,
  usersApi,
  workspacesApi,
  UI_ROLE_TO_CODE,
  type ApiRole,
  type ApiUser,
  type ApiWorkspace,
  type UiRoleLabel,
} from "@/lib/services";
import { AD_USERS } from "@/lib/mock-ad-users";
import { buildUsername } from "@/lib/username";

// ─── Types ────────────────────────────────────────────────────────────────────

// Full UI vocabulary — display can include "Delegate"/"Supervisor" even though
// only the ROLES subset below is assignable from this page.
type UserRole = UiRoleLabel;
type UserStatus = "Active" | "Inactive";
type SortField =
  | "username"
  | "fullName"
  | "role"
  | "workspace"
  | "status"
  | "lastLogin";
type SortDir = "asc" | "desc";

interface User {
  id: string;
  username: string;
  fullName: string;
  // Any UI role label — codeToUiRole can also produce "Delegate" (a CEO
  // membership), which isn't one of the assignable ROLES above.
  role: UiRoleLabel | "";
  workspace: string;
  workspaceId: string | null;
  division: string;
  status: UserStatus;
  lastLogin: string;
  privileges: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES: UserRole[] = ["Admin", "Operator", "Viewer"];

function formatLastLogin(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromApi(u: ApiUser): User {
  return {
    id: u.id,
    username: u.username,
    fullName: u.displayName,
    // Real values, derived from the user's primary workspace membership
    role: codeToUiRole(u.primaryRole),
    workspace: u.primaryWorkspace ?? "",
    workspaceId: u.memberships[0]?.workspaceId ?? null,
    division: u.division ?? "",
    status: u.status === "ACTIVE" ? "Active" : "Inactive",
    lastLogin: formatLastLogin(u.lastLoginAt),
    privileges: [], // no per-user privilege endpoint on the backend yet
  };
}

// ─── Temporary-integration banner ─────────────────────────────────────────────

function TemporaryNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 px-3.5 py-2.5 text-sm text-amber-800 dark:text-amber-300">
      <Info className="size-4 mt-0.5 shrink-0" />
      <p>
        <span className="font-medium">Temporary integration:</span> users are
        local backend accounts until Active Directory integration lands. The AD
        user list is mocked and per-user privileges are UI-only; role, workspace
        and status are persisted via the user&apos;s workspace membership.
      </p>
    </div>
  );
}

// ─── Create User Dialog ───────────────────────────────────────────────────────

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: ApiWorkspace[];
  onSave: (
    user: Omit<User, "id" | "lastLogin" | "privileges">,
    password: string,
  ) => Promise<void>;
}

function CreateUserDialog({
  open,
  onOpenChange,
  workspaces,
  onSave,
}: CreateUserDialogProps) {
  const [adUser, setAdUser] = React.useState("");
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [role, setRole] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Suspended workspaces can't take new members, so they're excluded here —
  // unlike EditUserDialog there's no existing assignment to preserve. An
  // umbrella (isBranchParent) holds no data of its own and can never take a
  // member directly — only standalone workspaces and branches can, so it's
  // excluded too; pick the branch itself instead.
  const assignableWorkspaces = workspaces.filter(
    (w) => w.status === "ACTIVE" && !w.isBranchParent,
  );
  const selectedWs = assignableWorkspaces.find((w) => w.id === workspaceId);

  const username = React.useMemo(
    () => (adUser ? buildUsername(selectedWs?.name ?? "", role, adUser, "") : ""),
    [adUser, selectedWs, role],
  );

  React.useEffect(() => {
    if (open) {
      setAdUser("");
      setWorkspaceId("");
      setRole("");
      setPassword("");
      setShowPassword(false);
    }
  }, [open]);

  async function handleSave() {
    const missing: string[] = [];
    if (!adUser) missing.push("a user from AD");
    if (!password.trim()) missing.push("a temporary password");
    if (missing.length > 0) {
      toast.error(`Please provide ${missing.join(", ")}.`, {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
      return;
    }
    setSaving(true);
    try {
      await onSave(
        {
          username,
          fullName: adUser,
          role: role as UserRole,
          workspace: selectedWs?.name ?? "",
          workspaceId: workspaceId || null,
          division: "",
          status: "Active",
        },
        password,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader guideId="allusers-user-form">
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Username format: workspace-role-name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              readOnly
              value={username}
              placeholder="underwriting-admin-Girma"
              className="font-mono bg-muted/50 text-muted-foreground"
            />
          </div>

          <div className="space-y-1.5" data-guide="au-user">
            <Label>
              Select User <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              items={AD_USERS.map((u) => ({ value: u, label: u }))}
              value={adUser}
              onValueChange={setAdUser}
              placeholder="Select user from AD"
              searchPlaceholder="Search users…"
              emptyText="No matching users."
            />
            <TempFieldHint>
              Temporary mock list — AD integration pending.
            </TempFieldHint>
          </div>

          <div className="grid grid-cols-2 gap-4" data-guide="au-workspace-role">
            <div className="space-y-1.5">
              <Label>Workspace / Branch</Label>
              <SearchableSelect
                items={assignableWorkspaces.map((w) => ({
                  value: w.id,
                  label: w.parentName ? `${w.name} (${w.parentName})` : w.name,
                  keywords: `${w.name} ${w.parentName ?? ""} ${w.code}`,
                }))}
                value={workspaceId}
                onValueChange={setWorkspaceId}
                placeholder="Select (optional)"
                searchPlaceholder="Search workspaces…"
                emptyText="No workspaces found."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <SearchableSelect
                items={ROLES.map((r) => ({ value: r, label: r }))}
                value={role}
                onValueChange={setRole}
                placeholder="Select (optional)"
                searchPlaceholder="Search roles…"
                emptyText="No roles found."
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            Workspace and role are optional — assign them now to grant access, or
            leave blank and add the user to a workspace later. Picking a branch
            assigns them to that branch specifically.
          </p>

          <div className="space-y-1.5">
            <Label>
              Password <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            <TempFieldHint>
              Required while accounts are local — removed once AD handles
              credentials.
            </TempFieldHint>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            <Plus />
            {saving ? "Creating..." : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Dialog ─────────────────────────────────────────────────────────

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  workspaces: ApiWorkspace[];
  onSave: (
    updates: Pick<User, "workspace" | "workspaceId" | "role" | "division">,
    newPassword: string,
  ) => Promise<void>;
}

function EditUserDialog({
  open,
  onOpenChange,
  user,
  workspaces,
  onSave,
}: EditUserDialogProps) {
  const [workspaceId, setWorkspaceId] = React.useState(user?.workspaceId ?? "");
  const [role, setRole] = React.useState<UserRole | "">(user?.role ?? "");
  const [password, setPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Suspended workspaces aren't offered for (re-)assignment, but if the user's
  // *current* workspace happens to be suspended it's kept as an option so the
  // select still shows it instead of going blank. An umbrella never holds
  // members directly, so it's excluded — pick the branch itself instead.
  const activeWorkspaces = workspaces.filter(
    (w) => w.status === "ACTIVE" && !w.isBranchParent,
  );
  const currentWs = workspaces.find((w) => w.id === workspaceId);
  const assignableWorkspaces =
    currentWs && currentWs.status !== "ACTIVE"
      ? [currentWs, ...activeWorkspaces]
      : activeWorkspaces;
  const selectedWs = currentWs;

  React.useEffect(() => {
    if (open && user) {
      setWorkspaceId(user.workspaceId ?? "");
      setRole(user.role);
      setPassword("");
    }
  }, [open, user]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(
        { workspace: selectedWs?.name ?? "", workspaceId: workspaceId || null, role, division: "" },
        password,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              readOnly
              value={user?.username ?? ""}
              className="font-mono bg-muted/50 text-muted-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Workspace / Branch</Label>
              <SearchableSelect
                items={assignableWorkspaces.map((w) => ({
                  value: w.id,
                  label: w.parentName ? `${w.name} (${w.parentName})` : w.name,
                  keywords: `${w.name} ${w.parentName ?? ""} ${w.code}`,
                }))}
                value={workspaceId}
                onValueChange={setWorkspaceId}
                placeholder="Select (optional)"
                searchPlaceholder="Search workspaces…"
                emptyText="No workspaces found."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <SearchableSelect
                items={ROLES.map((r) => ({ value: r, label: r }))}
                value={role}
                onValueChange={(v) => setRole(v as UserRole)}
                placeholder="Select (optional)"
                searchPlaceholder="Search roles…"
                emptyText="No roles found."
              />
            </div>
          </div>

          {workspaceId && user?.workspaceId && workspaceId !== user.workspaceId && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 -mt-2">
              Changing the workspace will remove {user.fullName || "this user"} from
              &ldquo;{user.workspace}&rdquo; and add them to the new one — a user can
              belong to only one workspace.
            </div>
          )}

          <TempFieldHint>
            Role and workspace are optional and saved as a workspace membership.
            Assigning both grants the user access; leaving them blank keeps the
            account with no workspace. Picking a branch assigns them to that
            branch specifically.
          </TempFieldHint>

          <Separator />

          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="Leave blank to keep current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TempFieldHint>
              Local credentials — temporary until AD integration.
            </TempFieldHint>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sortable Header ──────────────────────────────────────────────────────────

function SortableHead({
  children,
  field,
  sortField,
  sortDir,
  onSort,
  className,
}: {
  children: React.ReactNode;
  field: SortField;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  void sortDir;
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-left hover:text-foreground transition-colors"
      >
        {children}
        <ArrowUpDown
          className={`size-3.5 shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`}
        />
      </button>
    </TableHead>
  );
}

// ─── All Users Page ────────────────────────────────────────────────────────────

export default function AllUsersPage() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  // Full workspace + role catalogues, used to resolve names/labels to the IDs
  // the membership endpoints require.
  const [workspaces, setWorkspaces] = React.useState<ApiWorkspace[]>([]);
  const [roles, setRoles] = React.useState<ApiRole[]>([]);
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [sortField, setSortField] = React.useState<SortField | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [pageKey, setPageKey] = React.useState(0);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<User | null>(null);
  const [editKey, setEditKey] = React.useState(0);
  const [deactivateTarget, setDeactivateTarget] = React.useState<User | null>(
    null,
  );
  const [reactivateTarget, setReactivateTarget] = React.useState<User | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    usersApi
      .list()
      .then((data) => {
        if (!cancelled) setUsers(data.map(fromApi));
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(apiErrorMessage(err, "Failed to load users."), {
            icon: <XCircle className="size-4" strokeWidth={2.5} />,
            duration: 7000,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Real workspaces for the selects + name→id resolution; the dialogs fall
    // back to the static department list when this hasn't loaded yet.
    workspacesApi
      .list()
      .then((data) => {
        if (cancelled) return;
        setWorkspaces(data);
      })
      .catch(() => {
        /* keep static fallback */
      });

    // Role catalogue for label→roleId resolution when assigning membership
    rolesApi
      .list()
      .then((data) => {
        if (!cancelled) setRoles(data);
      })
      .catch(() => {
        /* membership assignment will warn if roles are unavailable */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve a UI role label + workspace ID to the backend role + workspace
  // IDs the membership endpoints need. Returns null when no role was chosen.
  function resolveMembership(
    roleLabel: UserRole | "",
    workspaceId: string | null,
  ):
    | { ok: true; workspaceId: string; roleId: string; roleCode: string }
    | { ok: false; reason: "unmapped-role" | "unknown-workspace" }
    | null {
    if (!roleLabel) return null;
    const roleCode = UI_ROLE_TO_CODE[roleLabel as UiRoleLabel];
    if (!roleCode) return { ok: false, reason: "unmapped-role" };
    const ws = workspaceId ? workspaces.find((w) => w.id === workspaceId) : undefined;
    const role = roles.find((r) => r.code === roleCode);
    if (!ws || !role) return { ok: false, reason: "unknown-workspace" };
    return { ok: true, workspaceId: ws.id, roleId: role.id, roleCode };
  }

  const filtered = React.useMemo(() => {
    let result = users.filter((u) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.workspace.toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchStatus = statusFilter === "all" || u.status === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });

    if (sortField) {
      result = [...result].sort((a, b) => {
        const av = a[sortField];
        const bv = b[sortField];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [users, search, roleFilter, statusFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * rowsPerPage;
  const paged = filtered.slice(pageStart, pageStart + rowsPerPage);
  const placeholderCount = rowsPerPage - paged.length;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, statusFilter]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function goToPage(page: number) {
    const next = Math.max(1, Math.min(totalPages, page));
    if (next === safePage) return;
    setCurrentPage(next);
    setPageKey((k) => k + 1);
  }

  async function handleCreate(
    data: Omit<User, "id" | "lastLogin" | "privileges">,
    password: string,
  ) {
    try {
      const created = await usersApi.create({
        username: data.username,
        displayName: data.fullName,
        password,
      });

      // Assign the workspace membership that carries role + workspace
      let note = "";
      const resolved = resolveMembership(data.role, data.workspaceId);
      if (resolved?.ok) {
        try {
          await workspacesApi.addMember(
            resolved.workspaceId,
            created.id,
            resolved.roleId,
          );
        } catch (e) {
          note = ` Account created, but role assignment failed: ${apiErrorMessage(e, "membership error")}`;
        }
      } else if (resolved?.reason === "unmapped-role") {
        note = ` "${data.role}" has no backend role yet, so no workspace role was assigned.`;
      } else if (resolved?.reason === "unknown-workspace") {
        note = ` Account created; "${data.workspace}" isn't a backend workspace yet, so no role was assigned.`;
      }

      // Re-fetch so the row reflects the membership-derived role/workspace
      const full = await usersApi.get(created.id).catch(() => created);
      setUsers((prev) => [fromApi(full), ...prev]);
      setCreateOpen(false);
      toast.success("User created successfully." + note, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        ...(note ? { duration: 8000 } : {}),
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create user."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleEdit(
    updates: Pick<User, "workspace" | "workspaceId" | "role" | "division">,
    newPassword: string,
  ) {
    if (!editTarget) return;
    const targetId = editTarget.id;
    try {
      // Password reset persists on the user profile directly.
      if (newPassword.trim()) {
        await usersApi.update(targetId, { password: newPassword });
      }

      // Role/workspace persist as a membership. The grid shows the user's
      // FIRST membership (backend derives primaryRole/primaryWorkspace from
      // memberships.get(0)), so a plain addMember would add a *second*
      // membership and the row would look unchanged. We therefore MOVE the
      // user: ensure the target-workspace membership with the right role, then
      // remove any memberships in other workspaces.
      let note = "";
      const resolved = resolveMembership(updates.role, updates.workspaceId);
      if (resolved?.ok) {
        try {
          const current = await usersApi.get(targetId);
          const existing = current.memberships.find(
            (m) => m.workspaceId === resolved.workspaceId,
          );
          if (existing && existing.role !== resolved.roleCode) {
            await workspacesApi.changeMemberRole(
              resolved.workspaceId,
              targetId,
              resolved.roleId,
            );
          } else if (!existing) {
            await workspacesApi.addMember(
              resolved.workspaceId,
              targetId,
              resolved.roleId,
            );
          }

          // Remove stale memberships in OTHER workspaces so the user "moves"
          // rather than accumulating memberships (the grid reads the first one).
          const stale = current.memberships.filter(
            (m) => m.workspaceId !== resolved.workspaceId,
          );
          for (const m of stale) {
            try {
              await workspacesApi.removeMember(m.workspaceId, targetId);
            } catch {
              note = ` Profile saved and new membership set, but the old membership in "${m.workspaceName}" could not be removed.`;
            }
          }
        } catch (e) {
          note = ` Profile saved, but role change failed: ${apiErrorMessage(e, "membership error")}`;
        }
      } else if (resolved?.reason === "unmapped-role") {
        note = ` "${updates.role}" has no backend role yet, so the role wasn't changed.`;
      } else if (resolved?.reason === "unknown-workspace") {
        note = ` Profile saved; "${updates.workspace}" isn't a backend workspace, so the role/workspace wasn't changed.`;
      }

      // Re-fetch so the row reflects the server's membership state
      const full = await usersApi.get(targetId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetId ? { ...fromApi(full), privileges: u.privileges } : u,
        ),
      );
      setEditTarget(null);
      toast.success("User updated successfully." + note, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        ...(note ? { duration: 8000 } : {}),
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update user."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    const name = deactivateTarget.fullName;
    try {
      await usersApi.deactivate(deactivateTarget.id);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === deactivateTarget.id
            ? { ...u, status: "Inactive" as const }
            : u,
        ),
      );
      setDeactivateTarget(null);
      toast.success(`${name} has been deactivated. They can no longer sign in until reactivated.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to deactivate user."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleActivate(user: User) {
    try {
      await usersApi.activate(user.id);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, status: "Active" as const } : u,
        ),
      );
      setReactivateTarget(null);
      toast.success(`${user.fullName} has been re-activated.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to activate user."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  const sortProps = { sortField, sortDir, onSort: handleSort };

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 text-sm">
      <span className="text-muted-foreground">{filtered.length} row(s)</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground whitespace-nowrap">
          Rows per page
        </span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(v) => {
            setRowsPerPage(Number(v));
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground whitespace-nowrap mr-1">
          Page {safePage} of {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(1)}
          disabled={safePage === 1}
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(safePage - 1)}
          disabled={safePage === 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(safePage + 1)}
          disabled={safePage === totalPages}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(totalPages)}
          disabled={safePage === totalPages}
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <TypographyH3>All Users Management</TypographyH3>
        <TypographyMuted>
          Convention: workspace-[division]-role-name &nbsp;&nbsp; e.g.
          underwriting-main-admin-James
        </TypographyMuted>
      </div>
      <Separator />

      <TemporaryNotice />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Role filter — custom label to avoid SelectValue rendering raw "all" */}
        <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v)}>
          <SelectTrigger className="min-w-32.5">
            <span className="flex-1 text-sm text-left">
              {roleFilter === "all" ? "All Roles" : roleFilter}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter — same custom label approach */}
        <Select
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v)}
        >
          <SelectTrigger className="min-w-35">
            <span className="flex-1 text-sm text-left">
              {statusFilter === "all" ? "All Statuses" : statusFilter}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Button className="ml-auto" onClick={() => setCreateOpen(true)} data-guide="allusers-new">
          <Plus />
          New User
        </Button>
      </div>

      {/* Table */}
      <Table pagination={pagination}>
        <TableHeader>
          <TableRow>
            <SortableHead field="username" {...sortProps} className="pl-4 w-65">
              Username
            </SortableHead>
            <SortableHead field="fullName" {...sortProps}>
              Full Name
            </SortableHead>
            <SortableHead field="role" {...sortProps}>
              Role
            </SortableHead>
            <SortableHead field="workspace" {...sortProps}>
              Workspace
            </SortableHead>
            <SortableHead field="status" {...sortProps}>
              Status
            </SortableHead>
            <SortableHead field="lastLogin" {...sortProps}>
              Last Login
            </SortableHead>
            <TableHead className="pl-4 w-28 text-left">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody key={pageKey} className="animate-in fade-in duration-200">
          {paged.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center py-12 text-muted-foreground"
              >
                {loading
                  ? "Loading users..."
                  : "No users match the current filters."}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {paged.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="pl-4 font-mono text-xs">
                    {user.username}
                  </TableCell>
                  <TableCell>{user.fullName}</TableCell>
                  <TableCell className="text-xs uppercase tracking-wide">
                    {user.role || "—"}
                  </TableCell>
                  <TableCell className="text-xs uppercase tracking-wide">
                    {user.workspace || "—"}
                  </TableCell>
                  <TableCell
                    className={
                      user.status === "Active"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {user.status}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {user.lastLogin}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditKey((k) => k + 1);
                          setEditTarget(user);
                        }}
                      >
                        <SquarePen className="size-4" />
                      </Button>
                      {user.status === "Active" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeactivateTarget(user)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-green-600 hover:text-green-600 dark:text-green-400"
                          onClick={() => setReactivateTarget(user)}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {/* Placeholder rows keep height stable when last page has fewer rows */}
              {Array.from({ length: placeholderCount }).map((_, i) => (
                <TableRow
                  key={`ph-${i}`}
                  className="pointer-events-none border-b-0 hover:bg-transparent"
                >
                  <TableCell colSpan={7} className="p-0 h-10" />
                </TableRow>
              ))}
            </>
          )}
        </TableBody>
      </Table>

      {/* Create Dialog */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaces={workspaces}
        onSave={handleCreate}
      />

      {/* Edit Dialog */}
      <EditUserDialog
        key={editKey}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        user={editTarget}
        workspaces={workspaces}
        onSave={handleEdit}
      />

      {/* Deactivate Confirmation */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate User</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate &ldquo;
              {deactivateTarget?.fullName}&rdquo;? They will lose system access
              immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!reactivateTarget}
        onOpenChange={(open) => !open && setReactivateTarget(null)}
        title="Reactivate User?"
        description={`Reactivating "${reactivateTarget?.fullName ?? ""}" restores their access to the platform — they'll be able to sign in again.`}
        confirmLabel="Reactivate"
        onConfirm={() => reactivateTarget && handleActivate(reactivateTarget)}
      />
    </div>
  );
}
