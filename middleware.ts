import { NextResponse, type NextRequest } from "next/server";

export function middleware(_request: NextRequest) {
  // Phase 2 will wire Supabase session refresh + role-based route protection here.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health).*)"],
};
