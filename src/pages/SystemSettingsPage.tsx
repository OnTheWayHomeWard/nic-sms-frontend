"use client";
import * as React from "react";

import { XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { settingsApi, apiErrorMessage } from "@/lib/services";

// Backend keys (V014__system_settings.sql). Rate limit is per-gateway; retry /
// session / retention are single global values shared across both gateways.
const KEY_ETHIO_RATE = "ETHIO_TELECOM_RATE_LIMIT";
const KEY_SAF_RATE = "SAFARICOM_RATE_LIMIT";
const KEY_RETRY = "RETRY_ATTEMPTS";
const KEY_SESSION = "SESSION_TIMEOUT_MINUTES";
const KEY_RETENTION = "LOG_RETENTION_DAYS";

// Retention is stored as a number of days on the backend; the UI presents
// human labels. These maps convert between the two.
const RETENTION_OPTIONS: { label: string; days: string }[] = [
  { label: "3 Months", days: "90" },
  { label: "6 Months", days: "180" },
  { label: "1 Year", days: "365" },
  { label: "2 Years", days: "730" },
];
function daysToLabel(days: string): string {
  if (!days) return "";
  // A value set outside this page (e.g. the 90-day seed changed in the DB)
  // must still load — otherwise the field showed blank and Save was blocked.
  return RETENTION_OPTIONS.find((o) => o.days === days)?.label ?? `${days} days`;
}
function labelToDays(label: string): string {
  return (
    RETENTION_OPTIONS.find((o) => o.label === label)?.days ??
    (/^(\d+) days$/.exec(label)?.[1] ?? "")
  );
}

// Mirrors SystemSettingsService.RULES on the backend (which re-validates).
const LIMITS: Record<string, { min: number; max: number; label: string }> = {
  [KEY_ETHIO_RATE]: { min: 1, max: 10000, label: "Rate limit" },
  [KEY_SAF_RATE]: { min: 1, max: 10000, label: "Rate limit" },
  [KEY_RETRY]: { min: 0, max: 10, label: "Retry attempts" },
  [KEY_SESSION]: { min: 1, max: 1440, label: "Session timeout" },
};

function validate(key: string, value: string): string | null {
  const rule = LIMITS[key];
  if (!rule) return null;
  const v = value.trim();
  if (!/^\d+$/.test(v) || Number(v) < rule.min || Number(v) > rule.max) {
    return `${rule.label} must be a whole number between ${rule.min} and ${rule.max}.`;
  }
  return null;
}

export default function SystemSettingsPage() {
  // Per-gateway rate limits
  const [ethioRateLimit, setEthioRateLimit] = React.useState("");
  const [safRateLimit, setSafRateLimit] = React.useState("");

  // Global (shared) settings — bound by both tabs
  const [retryAttempts, setRetryAttempts] = React.useState("");
  const [sessionTimeout, setSessionTimeout] = React.useState("");
  const [retention, setRetention] = React.useState(""); // stores the label

  const [loading, setLoading] = React.useState(true);

  // Which gateway's Save was pressed — drives the shared "Save Gateway
  // Settings?" confirmation; the write only runs on confirm.
  const [pendingSave, setPendingSave] = React.useState<null | "ethio" | "safaricom">(null);

  React.useEffect(() => {
    settingsApi
      .getAll()
      .then((s) => {
        setEthioRateLimit(s[KEY_ETHIO_RATE] ?? "");
        setSafRateLimit(s[KEY_SAF_RATE] ?? "");
        setRetryAttempts(s[KEY_RETRY] ?? "");
        setSessionTimeout(s[KEY_SESSION] ?? "");
        setRetention(daysToLabel(s[KEY_RETENTION] ?? ""));
      })
      .catch((e) => {
        toast.error(apiErrorMessage(e, "Failed to load settings."), {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  function save(rateKey: string, rateValue: string, gatewayName: string) {
    if (
      !rateValue.trim() ||
      !retryAttempts.trim() ||
      !sessionTimeout.trim() ||
      !retention.trim()
    ) {
      toast.error("Please fill in rate limit, retry attempts, session timeout, and log retention.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }

    const invalid =
      validate(rateKey, rateValue) ??
      validate(KEY_RETRY, retryAttempts) ??
      validate(KEY_SESSION, sessionTimeout);
    if (invalid) {
      toast.error(invalid, {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }

    const updates: Record<string, string> = {
      [rateKey]: rateValue.trim(),
      [KEY_RETRY]: retryAttempts.trim(),
      [KEY_SESSION]: sessionTimeout.trim(),
      [KEY_RETENTION]: labelToDays(retention),
    };

    // Reflect what the server actually stored (it normalizes values).
    const request = settingsApi.update(updates).then((s) => {
      setEthioRateLimit(s[KEY_ETHIO_RATE] ?? "");
      setSafRateLimit(s[KEY_SAF_RATE] ?? "");
      setRetryAttempts(s[KEY_RETRY] ?? "");
      setSessionTimeout(s[KEY_SESSION] ?? "");
      setRetention(daysToLabel(s[KEY_RETENTION] ?? ""));
      return s;
    });
    toast.promise(request, {
      loading: "Saving changes...",
      success: `${gatewayName} settings updated successfully!`,
      error: (e) => apiErrorMessage(e, "Failed to save gateway settings."),
      duration: 8000,
    });
  }

  function handleSaveEthio() {
    save(KEY_ETHIO_RATE, ethioRateLimit, "Ethio Telecom");
  }

  function handleSaveSafaricom() {
    save(KEY_SAF_RATE, safRateLimit, "Safaricom Ethiopia");
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          SMS Gateway Configuration
        </h1>

        <p className="text-sm text-muted-foreground">
          Platform-wide configuration — IT Administrator only.
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="ethio" className="space-y-6">
        <TabsList data-guide="settings-tabs">
          <TabsTrigger value="ethio">Ethio Telecom Gateway</TabsTrigger>
          <TabsTrigger value="safaricom">Safaricom Ethiopia Gateway</TabsTrigger>
        </TabsList>

        {/* Ethio Telecom */}
        <TabsContent value="ethio" className="space-y-10">
          <div className="grid gap-x-9 gap-y-6 md:grid-cols-2">
            {/* Rate Limit */}
            <div className="space-y-2" data-guide="ss-rate">
              <Label htmlFor="ethio-rate-limit">
                Rate Limit (SMS parts / second){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ethio-rate-limit"
                inputMode="numeric"
                value={ethioRateLimit}
                onChange={(e) => setEthioRateLimit(e.target.value)}
                placeholder="500"
                className="h-11"
                disabled={loading}
              />
            </div>

            {/* Retry Attempts */}
            <div className="space-y-2">
              <Label htmlFor="ethio-retry-attempts">
                Retry Attempts <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ethio-retry-attempts"
                inputMode="numeric"
                value={retryAttempts}
                onChange={(e) => setRetryAttempts(e.target.value)}
                placeholder="3"
                className="h-11"
                disabled={loading}
              />
            </div>

            {/* Session Timeout */}
            <div className="space-y-2">
              <Label htmlFor="ethio-session-timeout">
                Session Timeout (minutes){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ethio-session-timeout"
                inputMode="numeric"
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(e.target.value)}
                placeholder="5"
                className="h-11"
                disabled={loading}
              />
            </div>

            {/* Message Log Retention */}
            <div className="space-y-2" data-guide="ss-retention">
              <Label htmlFor="ethio-retention">
                Message Log Retention{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Select value={retention} onValueChange={(v) => v !== null && setRetention(v)} disabled={loading}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Select retention" />
                </SelectTrigger>
                <SelectContent>
                  {retention && !RETENTION_OPTIONS.some((o) => o.label === retention) && (
                    <SelectItem value={retention}>{retention}</SelectItem>
                  )}
                  {RETENTION_OPTIONS.map((o) => (
                    <SelectItem key={o.days} value={o.label}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end" data-guide="ss-save">
            <Button onClick={() => setPendingSave("ethio")} className="h-11 px-6" disabled={loading}>
              Save Changes
            </Button>
          </div>
        </TabsContent>

        {/* Safaricom */}
        <TabsContent value="safaricom" className="space-y-10">
          <div className="grid gap-x-9 gap-y-6 md:grid-cols-2">
            {/* Rate Limit */}
            <div className="space-y-2">
              <Label htmlFor="saf-rate-limit">
                Rate Limit (SMS parts / second){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="saf-rate-limit"
                inputMode="numeric"
                value={safRateLimit}
                onChange={(e) => setSafRateLimit(e.target.value)}
                placeholder="500"
                className="h-11"
                disabled={loading}
              />
            </div>

            {/* Retry Attempts */}
            <div className="space-y-2">
              <Label htmlFor="saf-retry-attempts">
                Retry Attempts <span className="text-destructive">*</span>
              </Label>
              <Input
                id="saf-retry-attempts"
                inputMode="numeric"
                value={retryAttempts}
                onChange={(e) => setRetryAttempts(e.target.value)}
                placeholder="3"
                className="h-11"
                disabled={loading}
              />
            </div>

            {/* Session Timeout */}
            <div className="space-y-2">
              <Label htmlFor="saf-session-timeout">
                Session Timeout (minutes){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="saf-session-timeout"
                inputMode="numeric"
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(e.target.value)}
                placeholder="5"
                className="h-11"
                disabled={loading}
              />
            </div>

            {/* Message Log Retention */}
            <div className="space-y-2">
              <Label htmlFor="saf-retention">
                Message Log Retention{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Select value={retention} onValueChange={(v) => v !== null && setRetention(v)} disabled={loading}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Select retention" />
                </SelectTrigger>
                <SelectContent>
                  {retention && !RETENTION_OPTIONS.some((o) => o.label === retention) && (
                    <SelectItem value={retention}>{retention}</SelectItem>
                  )}
                  {RETENTION_OPTIONS.map((o) => (
                    <SelectItem key={o.days} value={o.label}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setPendingSave("safaricom")} className="h-11 px-6" disabled={loading}>
              Save Changes
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Saving writes live SMSC config for everyone — confirm before it. */}
      <ConfirmDialog
        open={!!pendingSave}
        onOpenChange={(next) => !next && setPendingSave(null)}
        title="Save Gateway Settings?"
        description="This changes live SMS delivery configuration for everyone on the platform, effective immediately."
        confirmLabel="Save Changes"
        onConfirm={() => {
          const which = pendingSave;
          setPendingSave(null);
          if (which === "ethio") handleSaveEthio();
          else if (which === "safaricom") handleSaveSafaricom();
        }}
      />
    </div>
  );
}
