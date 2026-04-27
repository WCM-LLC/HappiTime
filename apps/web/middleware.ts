import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@happitime/shared-env";

const PUBLIC_PATHS = ["/login", "/auth", "/forgot-password", "/reset-password"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });
  let supabaseUrl = "";
  let supabaseKey = "";

  try {
    const env = getPublicSupabaseEnv();
    supabaseUrl = env.url;
    supabaseKey = env.anonKey;
  } catch {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: any; value: any; options: any }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request: { headers: request.headers },
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
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
