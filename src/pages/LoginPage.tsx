"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
  const { login } = useAuth();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
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
      // AuthContext sets user → App re-renders to the authenticated state.
      // Nothing to do here on success, and deliberately no setLoading(false):
      // this component unmounts, and clearing it first would flash the button
      // back to "Sign in" for a frame.
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Invalid credentials. Please try again."));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-md">
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden p-0">
            <CardContent className="p-0">
              {/* ── Left: form ── */}
              <form className="p-6 md:p-8" onSubmit={handleLogin}>
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
                      Sign in to your account
                    </h1>
                    <p className="text-sm text-muted-foreground text-balance">
                      Use your Nib Insurance domain username and password.
                    </p>
                  </div>

                  <Field>
                    <FieldLabel htmlFor="username">Username</FieldLabel>
                    <Input
                      id="username"
                      type="text"
                      placeholder="e.g. akebede"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoFocus
                      required
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
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
                    {/* Passwords live in Active Directory, so there is nothing
                        this app could reset — the old "Forgot password?" link
                        went nowhere anyway. */}
                    <FieldDescription className="text-xs">
                      Forgotten your password? Contact the IT department — it is
                      managed by Active Directory, not by this platform.
                    </FieldDescription>
                  </Field>

                  {error && (
                    <p className="text-sm text-destructive text-center -mt-2">
                      {error}
                    </p>
                  )}

                  <Field>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Sign in"
                      )}
                    </Button>
                  </Field>
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