import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge of the app. Two jobs only:
 *  1. Refresh the Supabase session cookie so server components see a live token.
 *  2. Tag the request with an id for logs/audit.
 * It never authorizes and never resolves tenants (ARCHITECTURE §5 B3, D-007).
 */
export async function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const forwarded = new Headers(request.headers);
  forwarded.set("x-request-id", requestId);

  let response = NextResponse.next({ request: { headers: forwarded } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: forwarded } });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    // Touch the session so expired access tokens are refreshed.
    await supabase.auth.getUser();
  }

  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|avif|glb|ktx2|woff2)$).*)"],
};
