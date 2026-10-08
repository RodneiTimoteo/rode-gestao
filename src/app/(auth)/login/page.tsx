import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { LoginForm } from "@/features/auth/components/login-form";
import { sanitizeNextPath } from "@/lib/auth/paths";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; message?: string; error?: string }> }) {
  const params = await searchParams;
  const message = params.message === "senha_atualizada" ? "Senha atualizada. Entre novamente com sua nova senha." : undefined;
  const error = params.error === "link_invalido" ? "O link é inválido ou expirou. Solicite uma nova recuperação de senha." : undefined;
  return <><AuthHeading title="Bem-vindo de volta" description="Entre com as credenciais fornecidas pelo administrador da RODE." /><LoginForm nextPath={sanitizeNextPath(params.next)} initialMessage={message} initialError={error} /></>;
}
