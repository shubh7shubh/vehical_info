import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_ROUTES = ["/login", "/api/health"];
const ADMIN_PREFIXES = ["/dashboard/admin"];
const OWNER_PREFIXES = ["/dashboard/owner"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const isAdminArea =
    !!user && ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const isOwnerArea =
    !!user && OWNER_PREFIXES.some((p) => pathname.startsWith(p));
  const isLogin = !!user && pathname === "/login";

  // Role is needed both for gating restricted areas and for the post-login
  // landing page — fetch it once when any of those apply.
  let role: string | null = null;
  let disabled = false;
  if (user && (isAdminArea || isOwnerArea || isLogin)) {
    const { data: profile } = await supabase
      .from("users")
      .select("role, disabled_at")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? null;
    disabled = !!profile?.disabled_at;
  }

  if (isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = role === "owner" ? "/dashboard/owner" : "/dashboard";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  if (isOwnerArea && (disabled || role !== "owner")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (isAdminArea && (disabled || role !== "admin")) {
    const url = request.nextUrl.clone();
    url.pathname = role === "owner" ? "/dashboard/owner" : "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
