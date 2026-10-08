import type { Metadata } from "next";
import { FeaturePage } from "@/features/shared/components/feature-page";
export const metadata: Metadata = { title: "Configurações" };
export default function Page() { return <FeaturePage title="Configurações" description="Gerencie preferências do sistema, equipe e parâmetros da organização." icon="settings" emptyTitle="As configurações serão disponibilizadas aqui" emptyDescription="Usuários, permissões e preferências serão implementados junto à autenticação e às políticas de acesso do Supabase." />; }
