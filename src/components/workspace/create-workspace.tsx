"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { Building2, GitBranch, XCircle } from "lucide-react";

import { toast } from "sonner";

import {
  apiErrorMessage,
  usersApi,
  workspacesApi,
  type ApiUser,
  type ApiWorkspace,
  type CreateWorkspaceBody,
} from "@/lib/services";
import {
  WORKSPACE_PERMISSIONS_LEFT,
  WORKSPACE_PERMISSIONS_RIGHT,
} from "@/lib/workspace-permissions";

/** A user can belong to only one workspace, so admins/delegates for a new
 * workspace (or new branch) must be unassigned. */
function isUnassigned(u: ApiUser): boolean {
  return u.memberships.length === 0;
}

function deriveCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type CreateType = "workspace" | "branch";

export default function CreateWorkspace({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  // What is being created: a top-level workspace, or a branch under an
  // existing branch-workspace (umbrella).
  const [createType, setCreateType] = React.useState<CreateType>("workspace");
  // Only for createType === "workspace": does this workspace hold branches?
  // When on, it becomes an umbrella and its mandatory first branch is created
  // alongside it.
  const [hasBranches, setHasBranches] = React.useState(false);

  const [workspaceName, setWorkspaceName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [dailyLimit, setDailyLimit] = React.useState("");
  const [adminUserId, setAdminUserId] = React.useState("");
  const [delegateUserId, setDelegateUserId] = React.useState("");
  const [delegationEnabled, setDelegationEnabled] = React.useState(false);
  const [checkedPerms, setCheckedPerms] = React.useState<Set<string>>(new Set());

  // Branch case: which umbrella to add under.
  const [parentWorkspaceId, setParentWorkspaceId] = React.useState("");
  // Umbrella case: the mandatory first branch.
  const [firstBranchName, setFirstBranchName] = React.useState("");

  const [users, setUsers] = React.useState<ApiUser[]>([]);
  const [umbrellas, setUmbrellas] = React.useState<ApiWorkspace[]>([]);
  const [saving, setSaving] = React.useState(false);

  const eligibleUsers = React.useMemo(() => users.filter(isUnassigned), [users]);
  const selectedParent = umbrellas.find((w) => w.id === parentWorkspaceId);

  // The workspace that will actually hold members/data — a standalone
  // workspace, the umbrella's first branch, or the new branch. It's the entity
  // that needs an admin.
  const isUmbrella = createType === "workspace" && hasBranches;
  const isBranch = createType === "branch";
  // Delegate sign-off is a standalone-workspace-only feature — a
  // branch-workspace (umbrella) or a branch can never have one.
  const delegationAvailable = !isBranch && !isUmbrella;

  React.useEffect(() => {
    let cancelled = false;
    usersApi
      .list("ACTIVE")
      .then((data) => !cancelled && setUsers(data))
      .catch((err) => {
        if (!cancelled)
          toast.error(apiErrorMessage(err, "Failed to load users."), {
            icon: <XCircle className="size-4" strokeWidth={2.5} />,
          });
      });
    workspacesApi
      .list()
      .then((data) => !cancelled && setUmbrellas(data.filter((w) => w.isBranchParent)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function handleNameChange(value: string) {
    setWorkspaceName(value);
    if (!codeTouched) setCode(deriveCode(value));
  }

  function togglePerm(id: string) {
    setCheckedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setWorkspaceName("");
    setCode("");
    setCodeTouched(false);
    setDailyLimit("");
    setAdminUserId("");
    setDelegateUserId("");
    setDelegationEnabled(false);
    setCheckedPerms(new Set());
    setParentWorkspaceId("");
    setFirstBranchName("");
    setHasBranches(false);
  }

  async function handleCreateWorkspace() {
    // Shared required fields
    if (!workspaceName.trim() || !code.trim()) {
      toast.error("Name and code are required.", { icon: <XCircle className="size-4" strokeWidth={2.5} /> });
      return;
    }
    if (isBranch && !parentWorkspaceId) {
      toast.error("Select the parent branch-workspace.", { icon: <XCircle className="size-4" strokeWidth={2.5} /> });
      return;
    }
    if (isUmbrella && !firstBranchName.trim()) {
      toast.error("A branch workspace must have at least one branch — name its first branch.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
      });
      return;
    }
    if (!adminUserId) {
      toast.error(
        isUmbrella ? "Assign an admin for the first branch." : "Assign an admin.",
        { icon: <XCircle className="size-4" strokeWidth={2.5} /> },
      );
      return;
    }
    // Permissions are only chosen for a workspace/umbrella; a branch inherits.
    if (!isBranch && checkedPerms.size === 0 && !delegationEnabled) {
      toast.error("At least one permission must be selected.", { icon: <XCircle className="size-4" strokeWidth={2.5} /> });
      return;
    }
    if (delegationEnabled && delegationAvailable && !delegateUserId) {
      toast.error("Please assign a delegate for the sign-off permission.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
      });
      return;
    }

    const limitNum = Number(dailyLimit);
    const dailySmsLimit = dailyLimit.trim() && Number.isInteger(limitNum) ? limitNum : undefined;
    const permissions = [...checkedPerms, ...(delegationEnabled ? ["DELEGATION"] : [])];
    const delegateFields =
      delegationEnabled && delegationAvailable && delegateUserId
        ? { delegateUserId }
        : {};

    let body: CreateWorkspaceBody;
    if (isBranch) {
      body = {
        code: code.trim(),
        name: workspaceName.trim(),
        parentWorkspaceId,
        adminUserId,
        ...delegateFields,
      };
    } else if (isUmbrella) {
      body = {
        code: code.trim(),
        name: workspaceName.trim(),
        kind: "GENERIC",
        dailySmsLimit,
        isBranchParent: true,
        firstBranchName: firstBranchName.trim(),
        firstBranchAdminUserId: adminUserId,
        permissions,
        ...delegateFields,
      };
    } else {
      body = {
        code: code.trim(),
        name: workspaceName.trim(),
        kind: "GENERIC",
        dailySmsLimit,
        adminUserId,
        permissions,
        ...delegateFields,
      };
    }

    setSaving(true);
    try {
      await toast
        .promise(workspacesApi.create(body), {
          loading: "Creating...",
          success: isUmbrella
            ? "Branch workspace and its first branch created!"
            : isBranch
              ? "Branch created!"
              : "Workspace created!",
          error: (err) => apiErrorMessage(err, "Failed to create."),
        })
        .unwrap();
      reset();
      onCreated?.();
    } catch {
      /* handled by toast.promise */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-4 sm:p-6 space-y-6">
      {/* Type selector */}
      <div className="space-y-3" data-guide="ws-create-type">
        <div>
          <p className="font-semibold text-base">What are you creating?</p>
          <p className="text-sm text-muted-foreground">
            A top-level workspace, or a branch under an existing branch-workspace.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-guide="ws-type-workspace"
            onClick={() => setCreateType("workspace")}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
              createType === "workspace"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:bg-accent/40",
            )}
          >
            <Building2 className="size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Workspace</p>
              <p className="text-xs text-muted-foreground">
                A department. Optionally divided into branches.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setCreateType("branch")}
            disabled={umbrellas.length === 0}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              createType === "branch"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:bg-accent/40",
            )}
          >
            <GitBranch className="size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Branch</p>
              <p className="text-xs text-muted-foreground">
                {umbrellas.length === 0
                  ? "No branch-workspaces exist yet."
                  : "A branch under an existing branch-workspace."}
              </p>
            </div>
          </button>
        </div>

        {createType === "workspace" && (
          <div className="flex items-start gap-3 rounded-lg border bg-accent/20 p-3" data-guide="ws-has-branches-row">
            <Checkbox
              id="has-branches"
              data-guide="ws-has-branches"
              checked={hasBranches}
              onCheckedChange={(v) => setHasBranches(Boolean(v))}
              className="mt-0.5 shrink-0"
            />
            <div>
              <Label htmlFor="has-branches" className="text-sm cursor-pointer">
                This workspace is divided into branches
              </Label>
              <p className="text-xs text-muted-foreground">
                It becomes an umbrella that holds no data itself — all work happens
                in its branches. You&apos;ll name its first branch below.
              </p>
            </div>
          </div>
        )}

        {isBranch && (
          <div className="space-y-1.5">
            <Label>
              Parent branch-workspace <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              items={umbrellas.map((w) => ({
                value: w.id,
                label: `${w.name} (${w.branchCount} branch${w.branchCount === 1 ? "" : "es"})`,
                keywords: w.name,
              }))}
              value={parentWorkspaceId}
              onValueChange={setParentWorkspaceId}
              placeholder="Select parent"
              searchPlaceholder="Search branch-workspaces…"
              emptyText="No branch-workspaces found."
            />
            <p className="text-xs text-muted-foreground">
              The branch inherits this workspace&apos;s permissions.
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* Details */}
      <div className="space-y-4" data-guide="ws-create-details">
        <div>
          <p className="font-semibold text-base">
            {isUmbrella ? "Branch-workspace details" : isBranch ? "Branch details" : "Workspace details"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isUmbrella
              ? "Name the umbrella. It groups branches and holds no campaigns itself."
              : "Define the details and assign an admin."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">
              {isUmbrella ? "Branch-workspace" : isBranch ? "Branch" : "Workspace"} Name{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="workspace-name"
              placeholder="e.g. Underwriting"
              value={workspaceName}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspace-code">
              Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="workspace-code"
              placeholder="e.g. underwriting"
              className="font-mono"
              value={code}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier. Cannot be changed after creation.
            </p>
          </div>
        </div>

        {/* A branch has no daily limit of its own — it's set once on the
            umbrella and applies to every branch beneath it. */}
        {!isBranch && (
          <div className="space-y-1.5">
            <Label htmlFor="daily-limit">Daily SMS Limit (optional)</Label>
            <Input
              id="daily-limit"
              type="number"
              min={0}
              placeholder="Unlimited"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
            {isUmbrella && (
              <p className="text-xs text-muted-foreground">
                Applies to this branch-workspace and every branch under it —
                branches don&apos;t have their own limit.
              </p>
            )}
          </div>
        )}

        {/* First branch (umbrella only) */}
        {isUmbrella && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">First branch</p>
              <p className="text-xs text-muted-foreground">
                Every branch-workspace must have at least one branch. This one is
                created immediately.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="first-branch-name">
                Branch name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="first-branch-name"
                placeholder="e.g. Main Branch"
                value={firstBranchName}
                onChange={(e) => setFirstBranchName(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>
            {isUmbrella ? "First branch admin" : "Assign admin"}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <SearchableSelect
            items={eligibleUsers.map((u) => ({
              value: u.id,
              label: `${u.displayName} (${u.username})`,
              keywords: u.username,
            }))}
            value={adminUserId}
            onValueChange={setAdminUserId}
            placeholder="Select user"
            searchPlaceholder="Search users by name or username…"
            emptyText="No unassigned users available."
            className="min-w-48"
          />
          <p className="text-xs text-muted-foreground">
            Becomes the Department Head. A user can only belong to one workspace,
            so only unassigned users are shown.
          </p>
        </div>
      </div>

      {/* Permissions — chosen for a workspace/umbrella; a branch inherits them */}
      {!isBranch ? (
        <>
          <Separator />
          <div className="space-y-4" data-guide="ws-create-perms">
            <div>
              <p className="font-semibold text-base">Workspace Permissions</p>
              <p className="text-sm text-muted-foreground">
                {isUmbrella
                  ? "These apply to the umbrella and are inherited by every branch."
                  : "Configure what this workspace can do."}
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2">
              {[WORKSPACE_PERMISSIONS_LEFT, WORKSPACE_PERMISSIONS_RIGHT].map((col, i) => (
                <div key={i} className="space-y-4">
                  {col.map((item) => (
                    <div key={item.code} className="flex items-start gap-3">
                      <Checkbox
                        id={item.code}
                        checked={checkedPerms.has(item.code)}
                        onCheckedChange={() => togglePerm(item.code)}
                        className="mt-0.5 shrink-0"
                      />
                      <div>
                        <Label htmlFor={item.code} className="text-sm cursor-pointer">
                          {item.title}
                        </Label>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border bg-accent/20 p-3 text-xs text-muted-foreground">
          This branch inherits{" "}
          <span className="font-medium text-foreground">
            {selectedParent?.name ?? "its parent"}
          </span>
          &apos;s permissions. They can&apos;t be changed per branch.
        </div>
      )}

      {/* Delegation — standalone workspaces only; never a branch-workspace or a branch */}
      {delegationAvailable && (
        <>
          <Separator />
          <div className="space-y-4" data-guide="ws-create-delegation">
            <div className="flex items-start gap-3">
              <Checkbox
                id="delegation"
                checked={delegationEnabled}
                onCheckedChange={(v) => {
                  setDelegationEnabled(Boolean(v));
                  if (!v) setDelegateUserId("");
                }}
                className="mt-0.5 shrink-0"
              />
              <div>
                <Label htmlFor="delegation" className="text-sm font-semibold cursor-pointer">
                  Require delegate sign-off
                </Label>
                <p className="text-xs text-muted-foreground">
                  Messages must be approved by a delegate before sending.
                </p>
              </div>
            </div>

            {delegationEnabled && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold">
                    Assign Delegate <span className="text-destructive">*</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Approves messages before they&apos;re sent. Must be an
                    unassigned user.
                  </p>
                </div>
                <SearchableSelect
                  items={eligibleUsers
                    .filter((u) => u.id !== adminUserId)
                    .map((u) => ({
                      value: u.id,
                      label: `${u.displayName} (${u.username})`,
                      keywords: u.username,
                    }))}
                  value={delegateUserId}
                  onValueChange={setDelegateUserId}
                  placeholder="Select delegate"
                  searchPlaceholder="Search users by name or username…"
                  emptyText="No eligible users available."
                />
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex mt-16 sm:mt-4 justify-end">
        <Button onClick={handleCreateWorkspace} disabled={saving} data-guide="ws-create-submit">
          {saving ? "Creating..." : isUmbrella ? "Create Branch-Workspace" : isBranch ? "Create Branch" : "Create Workspace"}
        </Button>
      </div>
    </div>
  );
}
