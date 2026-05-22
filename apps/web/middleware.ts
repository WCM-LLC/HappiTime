import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@happitime/shared-env";
import { isGuideAuthoringPath, loginPathFor, safeNextPath } from "@/utils/auth-paths";

const PUBLIC_PATHS = ["/", "/login", "/auth", "/forgot-password", "/reset-password", "/invite"];
const PROTECTED_PATHS = ["/dashboard", "/admin", "/orgs", "/change-password"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
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
    const next = safeNextPath(`${pathname}${request.nextUrl.search}`);
    if (next) loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  // Role gate: guide-authoring paths require role='super_user' or DB allowlisted admin.
  if (user && isGuideAuthoringPath(pathname)) {
    const { data: adminOk } = await supabase.rpc("is_happitime_admin");
    if (!adminOk) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if ((profile as any)?.role !== "super_user") {
        const next = safeNextPath(`${pathname}${request.nextUrl.search}`) ?? "/dashboard/guides";
        return NextResponse.redirect(new URL(loginPathFor(next, "not_authorized"), request.url));
      }
    }
  }

  if (user && pathname === "/login" && !request.nextUrl.searchParams.get("error")) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/dashboard";
    return NextResponse.redirect(new URL(next, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
