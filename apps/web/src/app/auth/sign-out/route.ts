import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** POST only, so a third-party <img src> cannot sign people out. */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  await supabase?.auth.signOut();
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
