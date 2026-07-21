"use client";

import * as React from "react";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import logo from "../assets/image.png";
import { useAuth } from "@/contexts/AuthContext";
import { apiErrorMessage } from "@/lib/services";

export default function LoginPage() {
  const { login, verifyOtp, resendOtp, preAuthToken, otpSentTo } = useAuth();

  const [step, setStep] = React.useState<"credentials" | "otp">("credentials");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter your username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      setStep("otp");
      toast.success("OTP sent to your registered contact.", {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Invalid credentials. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 6) {
      setError("Please enter the 6-digit OTP sent to your registered contact.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await verifyOtp(otp);
      // AuthContext sets user → App re-renders to authenticated state automatically
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Invalid or expired OTP. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setOtp("");
    setError("");
    try {
      await resendOtp();
      toast.success("OTP resent to your registered contact.", {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err: unknown) {
      setError(
        apiErrorMessage(err, "Failed to resend OTP. Please go back and try again."),
      );
    }
  }

  // Sync step with preAuthToken presence (handles edge cases on re-render)
  React.useEffect(() => {
    if (!preAuthToken && step === "otp") setStep("credentials");
  }, [preAuthToken, step]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-md">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden p-0">
            <CardContent className="p-0">
              {/* ── Left: form ── */}
              <form
                className="p-6 md:p-8"
                onSubmit={step === "credentials" ? handleLogin : handleVerify}
              >
                <FieldGroup>
                  {/* NIC branding */}
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-14 items-center justify-center rounded-xl bg-muted">
                      <img
                        src={logo}
                        alt="Nib Insurance Logo"
                        className="size-12 object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-lg font-bold leading-tight">
                        Nib Insurance S.C
                      </p>
                      <p className="text-sm text-muted-foreground">
                        NIC eSMS Platform
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1 text-center">
                    <h1 className="text-xl font-semibold">
                      {step === "credentials"
                        ? "Sign in to your account"
                        : "Verify your identity"}
                    </h1>
                    <p className="text-sm text-muted-foreground text-balance">
                      {step === "credentials"
                        ? "Enter your credentials to access the platform."
                        : `Enter the 6-digit code sent to ${otpSentTo ?? "your registered contact"}.`}
                    </p>
                  </div>

                  {step === "credentials" ? (
                    <>
                      <Field>
                        <FieldLabel htmlFor="username">Username</FieldLabel>
                        <Input
                          id="username"
                          type="text"
                          placeholder="e.g. admin"
                          autoComplete="username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          required
                        />
                      </Field>

                      <Field>
                        <div className="flex items-center justify-between">
                          <FieldLabel htmlFor="password">Password</FieldLabel>
                          <a
                            href="#"
                            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                          >
                            Forgot password?
                          </a>
                        </div>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="pr-9"
                          />
                          <button
                            type="button"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword((v) => !v)}
                            tabIndex={-1}
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            {showPassword ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field>
                        <FieldLabel htmlFor="otp">One-Time Password</FieldLabel>
                        <Input
                          id="otp"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="123456"
                          value={otp}
                          onChange={(e) =>
                            setOtp(e.target.value.replace(/\D/g, ""))
                          }
                          className="tracking-[0.5em] text-center text-lg font-mono"
                          autoFocus
                          required
                        />
                      </Field>

                      <FieldDescription className="text-center text-xs">
                        Didn&apos;t receive it?{" "}
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-foreground"
                          onClick={handleResend}
                        >
                          Resend OTP
                        </button>
                      </FieldDescription>
                    </>
                  )}

                  {error && (
                    <p className="text-sm text-destructive text-center -mt-2">
                      {error}
                    </p>
                  )}

                  <Field>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : step === "credentials" ? (
                        "Continue"
                      ) : (
                        "Verify & Sign In"
                      )}
                    </Button>
                  </Field>

                  {step === "otp" && (
                    <Field>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                          setStep("credentials");
                          setOtp("");
                          setError("");
                        }}
                      >
                        ← Back to login
                      </Button>
                    </Field>
                  )}
                </FieldGroup>
              </form>

            </CardContent>
          </Card>

          <FieldDescription className="px-6 text-center text-xs">
            By signing in, you agree to NIC&apos;s internal platform usage
            policies.
          </FieldDescription>
        </div>
      </div>
    </div>
  );
}