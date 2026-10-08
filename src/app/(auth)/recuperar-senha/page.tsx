import type { Metadata } from "next";
import { AuthHeading } from "@/features/auth/components/auth-heading";
import { RecoveryRequestForm } from "@/features/auth/components/recovery-request-form";

export const metadata: Metadata = { title: "Recuperar senha" };
export default function RecoveryPage() { return <><AuthHeading title="Recuperar senha" description="Informe seu e-mail. Se houver uma conta, enviaremos as instruções de recuperação." /><RecoveryRequestForm /></>; }
