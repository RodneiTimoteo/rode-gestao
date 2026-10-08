import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Definir nova senha" };
export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link_invalido");
  return <><AuthHeading title="Defina sua nova senha" description="Escolha uma senha forte para proteger o acesso à sua conta." /><UpdatePasswordForm /></>;
}
