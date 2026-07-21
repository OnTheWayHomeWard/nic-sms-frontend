import StatCards from "@/components/dashboard/stat-cards";
import WorkspaceTable from "@/components/dashboard/workspace-table";
import CampaignsTable from "@/components/dashboard/campaigns-table";
import AuditEvents from "@/components/dashboard/audit-events";
import ContactLists from "@/components/dashboard/contact-lists";
import WorkspaceUsersTable from "@/components/dashboard/workspace-users-table";
import CampaignManagementTable from "@/components/dashboard/campaign-management-table";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { atLeast } from "@/lib/permissions";

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role ?? null;

  const isSuperAdmin = atLeast(role, "SUPER_ADMIN");
  const isDeptHead   = atLeast(role, "DEPT_HEAD");
  const isOperator   = atLeast(role, "OPERATOR");

  const heading = isSuperAdmin
    ? "System Overview"
    : isDeptHead
    ? `${user?.workspaceName ?? "Workspace"} Overview`
    : "My Dashboard";

  const subheading = isSuperAdmin
    ? "Enterprise SMS Platform — All Workspaces"
    : user?.workspaceId
    ? `Enterprise SMS Platform — ${user.workspaceName ?? "Your Workspace"}`
    : "Enterprise SMS Platform";

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="text-sm text-muted-foreground">{subheading}</p>
      </div>
      <Separator />

      <StatCards />

      <div className="space-y-6" data-guide="dash-tables">
        {isSuperAdmin && (
          <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
            <WorkspaceTable />
            <AuditEvents />
          </div>
        )}

        {isDeptHead && !isSuperAdmin && (
          <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
            <WorkspaceUsersTable />
            <AuditEvents />
          </div>
        )}

        {isDeptHead && (
          <ContactLists />
        )}

        {isSuperAdmin && (
          <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
            <ContactLists />
            <WorkspaceUsersTable />
          </div>
        )}

        {isOperator && !isDeptHead && (
          <ContactLists />
        )}

        <CampaignsTable />

        {isDeptHead && (
          <CampaignManagementTable />
        )}
      </div>
    </div>
  );
}
