import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@happitime/shared-env";

const PUBLIC_PATHS = ["/", "/login", "/auth", "/forgot-password", "/reset-password", "/invite"];
const PROTECTED_PATHS = ["/dashboard", "/admin", "/orgs", "/change-password"];
// Paths that require super_user role OR admin membership in addition to auth.
const SUPER_USER_PATHS = ["/dashboard/guides"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isSuperUserPath(pathname: string) {
  return SUPER_USER_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const authDebug = process.env.AUTH_DEBUG === "1" || process.env.NEXT_PUBLIC_AUTH_DEBUG === "1";
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  let env: { url: string; anonKey: string };
  try {
    env = getPublicSupabaseEnv();
  } catch (error) {
    if (authDebug) {
      console.warn("[auth][middleware] missing Supabase public env", {
        pathname: request.nextUrl.pathname,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: any; value: any; options: any }[]) {
        // Mirror refreshed tokens onto the request so downstream Server Components
        // on this same request see the updated session, not the already-consumed tokens.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (authDebug) {
    console.log("[auth][middleware] auth check", {
      pathname,
      isPublic: isPublicPath(pathname),
      hasUser: !!user,
    });
  }

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  // Role gate: super_user paths require role='super_user' or admin email.
  // Admin email fast-path uses ADMIN_EMAILS env var (avoids DB call for admins).
  // Non-admins get a single user_profiles query; redirect if not super_user.
  if (user && isSuperUserPath(pathname)) {
    const adminEmails = new Set(
      (process.env.ADMIN_EMAILS ?? "admin@happitime.biz")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
    const userEmail = (user.email ?? "").toLowerCase();
    if (!adminEmails.has(userEmail)) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if ((profile as any)?.role !== "super_user") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = "?error=not_authorized";
        return NextResponse.redirect(url);
      }
    }
  }

  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
