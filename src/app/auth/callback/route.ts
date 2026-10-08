import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/paths";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const rawType = params.get("type");
  const allowedTypes: EmailOtpType[] = ["email", "recovery", "invite", "email_change", "signup", "magiclink"];
  const type = allowedTypes.find((value) => value === rawType);
  const defaultNext = type === "recovery" || type === "invite" ? "/redefinir-senha" : "/dashboard";
  const next = sanitizeNextPath(params.get("next") ?? defaultNext);
  const supabase = code || (tokenHash && type) ? await createClient() : null;
  let verified = false;

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type && supabase) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    verified = !error;
  }

  const response = NextResponse.redirect(
    new URL(verified ? next : "/login?error=link_invalido", request.url),
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
