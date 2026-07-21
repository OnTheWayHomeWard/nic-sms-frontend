"use client";

import * as React from "react";

import CreateWorkspace from "../components/workspace/create-workspace";
import DepartmentTable from "../components/workspace/department-table";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";

export default function WorkspacePage() {
  const [tab, setTab] = React.useState<"create" | "table">("table");
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Workspace Management
        </h1>

        <p className="text-sm text-muted-foreground">
          Create, edit, and manage workspaces.
        </p>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs
        className="mt-4 space-y-4"
        value={tab}
        onValueChange={(value) => setTab(value as "create" | "table")}
      >
        <TabsList data-guide="ws-tabs">
          <TabsTrigger value="create">Create Workspace</TabsTrigger>

          <TabsTrigger value="table">Workspaces</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <CreateWorkspace onCreated={() => { setTab("table"); setRefreshKey((k) => k + 1); }} />
        </TabsContent>

        <TabsContent value="table">
          <DepartmentTable refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
