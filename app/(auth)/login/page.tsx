import Link from "next/link";
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
    <div className="flex min-h-screen flex-1 items-center justify-center bg-muted px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
            VF
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Vehicle Finance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Loan Management — Internal Operations
          </p>
        </div>

        <form
          action={loginAction}
          className="space-y-4 rounded-2xl border border-border bg-background p-6 shadow-sm"
        >
          {next ? <input type="hidden" name="next" value={next} /> : null}

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@vehiclefinance.in"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Link
                href="#"
                className="text-xs text-muted-foreground hover:text-foreground"
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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>

          {error ? (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error === "missing"
                ? "Email and password are required."
                : decodeURIComponent(error)}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Sign in
          </button>
        </form>

      </div>
    </div>
  );
}
