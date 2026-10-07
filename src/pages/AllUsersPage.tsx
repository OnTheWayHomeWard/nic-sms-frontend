"use client";

import * as React from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
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
  type ApiAdUser,
  type ApiRole,
  type ApiUser,
  type ApiWorkspace,
  type UiRoleLabel,
} from "@/lib/services";
import { AdUserPicker } from "@/components/ui/ad-user-picker";
import { useAuth } from "@/contexts/AuthContext";

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
  /** Holds the platform SUPER_ADMIN role — not editable from this page. */
  isSuperAdmin: boolean;
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
    isSuperAdmin: u.memberships.some((m) => m.role === "SUPER_ADMIN"),
  };
}

// ─── Active Directory banner ──────────────────────────────────────────────────

function DirectoryNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-sky-300/60 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-700/50 px-3.5 py-2.5 text-sm text-sky-800 dark:text-sky-300">
      <Info className="size-4 mt-0.5 shrink-0" />
      <p>
        Accounts come from <span className="font-medium">Active Directory</span>.
        Username, name, email and password are managed in AD and can&apos;t be
        changed here — this page adds AD accounts to eSMS, places them in a
        workspace with a role, and activates or deactivates them.
      </p>
    </div>
  );
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: ApiWorkspace[];
  /** eSMS users that already hold a workspace membership. */
  assignedUserIds: ReadonlySet<string>;
  onSave: (adUser: ApiAdUser, role: UserRole | "", workspaceId: string | null) => Promise<void>;
}

function AddUserDialog({
  open,
  onOpenChange,
  workspaces,
  assignedUserIds,
  onSave,
}: AddUserDialogProps) {
  const [adUser, setAdUser] = React.useState<ApiAdUser | null>(null);
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [role, setRole] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Suspended workspaces can't take new members, so they're excluded here —
  // unlike EditUserDialog there's no existing assignment to preserve. An
  // umbrella (isBranchParent) holds no data of its own and can never take a
  // member directly — only standalone workspaces and branches can, so it's
  // excluded too; pick the branch itself instead.
  const assignableWorkspaces = workspaces.filter(
    (w) => w.status === "ACTIVE" && !w.isBranchParent,
  );

  React.useEffect(() => {
    if (open) {
      setAdUser(null);
      setWorkspaceId("");
      setRole("");
    }
  }, [open]);

  async function handleSave() {
    if (!adUser) {
      toast.error("Please pick a user from Active Directory.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
      return;
    }
    setSaving(true);
    try {
      await onSave(adUser, role as UserRole | "", workspaceId || null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader guideId="allusers-user-form">
          <DialogTitle>Add User from Active Directory</DialogTitle>
          <DialogDescription>
            Username, name, email and password come from AD.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5" data-guide="au-user">
            <Label>
              Select User <span className="text-destructive">*</span>
            </Label>
            <AdUserPicker
              value={adUser}
              onValueChange={setAdUser}
              assignedUserIds={assignedUserIds}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              readOnly
              value={adUser?.samAccountName ?? ""}
              placeholder="AD login name"
              className="font-mono bg-muted/50 text-muted-foreground"
            />
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
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            <Plus />
            {saving ? "Adding..." : "Add User"}
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
    }
  }, [open, user]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        workspace: selectedWs?.name ?? "",
        workspaceId: workspaceId || null,
        role,
        division: "",
      });
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
            Role and workspace are saved as a workspace membership. Assigning
            both grants the user access; clearing both removes them from their
            workspace. Picking a branch assigns them to that branch
            specifically. Name and password are managed in Active Directory.
          </TempFieldHint>
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
  const { user: currentUser } = useAuth();
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

  const [addOpen, setAddOpen] = React.useState(false);
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

  // Users already in a workspace can't be added to another one (one workspace
  // per user), so the AD picker blocks them; everyone else can be picked.
  const assignedUserIds = React.useMemo(
    () => new Set(users.filter((u) => u.workspaceId).map((u) => u.id)),
    [users],
  );

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

  async function handleAdd(
    adUser: ApiAdUser,
    role: UserRole | "",
    workspaceId: string | null,
  ) {
    try {
      // Returns the existing eSMS user when this AD account already has one.
      const added = await usersApi.addFromAd({ adSam: adUser.samAccountName });
      const alreadyInEsms = users.some((u) => u.id === added.id);

      // Assign the workspace membership that carries role + workspace
      let note = "";
      const resolved = resolveMembership(role, workspaceId);
      if (resolved?.ok) {
        try {
          await workspacesApi.addMember(resolved.workspaceId, added.id, resolved.roleId);
        } catch (e) {
          note = ` Account added, but workspace assignment failed: ${apiErrorMessage(e, "membership error")}`;
        }
      } else if (resolved?.reason === "unmapped-role") {
        note = ` "${role}" has no backend role yet, so no workspace role was assigned.`;
      } else if (resolved?.reason === "unknown-workspace") {
        note = " Pick both a workspace and a role to grant access — no workspace was assigned.";
      }

      // Re-fetch so the row reflects the membership-derived role/workspace
      const full = fromApi(await usersApi.get(added.id).catch(() => added));
      setUsers((prev) =>
        alreadyInEsms
          ? prev.map((u) => (u.id === full.id ? full : u))
          : [full, ...prev],
      );
      setAddOpen(false);
      const base = alreadyInEsms
        ? resolved?.ok && !note
          ? `${full.fullName} added to the workspace.`
          : `${full.fullName} is already in eSMS.`
        : "User added from Active Directory.";
      toast.success(base + note, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        ...(note ? { duration: 8000 } : {}),
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to add user."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleEdit(
    updates: Pick<User, "workspace" | "workspaceId" | "role" | "division">,
  ) {
    if (!editTarget) return;
    const targetId = editTarget.id;
    try {
      // Role/workspace persist as a membership, and a user holds at most one
      // (the backend refuses to add a second). So a change of workspace is a
      // MOVE: drop the old membership first, then add the new one. A role
      // change within the same workspace is done in place.
      let note = "";
      const current = await usersApi.get(targetId);
      const resolved = resolveMembership(updates.role, updates.workspaceId);
      if (resolved?.ok) {
        try {
          const existing = current.memberships.find(
            (m) => m.workspaceId === resolved.workspaceId,
          );
          for (const m of current.memberships) {
            if (m.workspaceId !== resolved.workspaceId) {
              await workspacesApi.removeMember(m.workspaceId, targetId);
            }
          }
          if (existing && existing.role !== resolved.roleCode) {
            await workspacesApi.changeMemberRole(resolved.workspaceId, targetId, resolved.roleId);
          } else if (!existing) {
            await workspacesApi.addMember(resolved.workspaceId, targetId, resolved.roleId);
          }
        } catch (e) {
          note = ` Workspace/role change failed: ${apiErrorMessage(e, "membership error")}`;
        }
      } else if (!updates.role && !updates.workspaceId) {
        // Both cleared: take the user out of their workspace.
        try {
          for (const m of current.memberships) {
            await workspacesApi.removeMember(m.workspaceId, targetId);
          }
        } catch (e) {
          note = ` Could not remove the workspace membership: ${apiErrorMessage(e, "membership error")}`;
        }
      } else if (resolved?.reason === "unmapped-role") {
        note = ` "${updates.role}" has no backend role yet, so the role wasn't changed.`;
      } else {
        note = " Pick both a workspace and a role — nothing was changed.";
      }

      // Re-fetch so the row reflects the server's membership state
      const full = await usersApi.get(targetId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetId ? { ...fromApi(full), privileges: u.privileges } : u,
        ),
      );
      if (note) {
        toast.error(note.trim(), {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 8000,
        });
        return;
      }
      setEditTarget(null);
      toast.success("User updated successfully.", {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
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
          Usernames are Active Directory login names.
        </TypographyMuted>
      </div>
      <Separator />

      <DirectoryNotice />

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

        <Button className="ml-auto" onClick={() => setAddOpen(true)} data-guide="allusers-new">
          <Plus />
          Add User
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
                    {/* The superadmin and your own account aren't managed here:
                        the backend refuses self-deactivation, and moving a
                        SUPER_ADMIN's membership would strip their role. */}
                    {user.isSuperAdmin || user.id === currentUser?.id ? (
                      <div className="text-right text-xs text-muted-foreground">—</div>
                    ) : (
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
                    )}
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

      {/* Add-from-AD Dialog */}
      <AddUserDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        workspaces={workspaces}
        assignedUserIds={assignedUserIds}
        onSave={handleAdd}
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
