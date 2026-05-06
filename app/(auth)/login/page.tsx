import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { loginAction } from "./actions";

export const metadata = {
  title: "Sign in — Vehicle Finance",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-gradient-to-br from-background via-background to-accent-soft px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <span className="text-lg font-bold tracking-tight">VF</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Vehicle Finance
          </h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Loan Management Platform
          </p>
        </div>

        <form
          action={loginAction}
          className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-md"
        >
          {next ? <input type="hidden" name="next" value={next} /> : null}

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@vehiclefinance.in"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <Link
                href="#"
                className="text-xs text-accent hover:underline"
              >
                Forgot?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>

          {error ? (
            <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error === "missing"
                ? "Email and password are required."
                : decodeURIComponent(error)}
            </p>
          ) : null}

          <SubmitButton
            pendingLabel="Signing in…"
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover disabled:opacity-70"
          >
            Sign in
          </SubmitButton>
        </form>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck size={12} /> Secured with role-based access
        </p>
      </div>
    </div>
  );
}
