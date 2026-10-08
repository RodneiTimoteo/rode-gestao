import type { Metadata } from "next";
import { FeaturePage } from "@/features/shared/components/feature-page";
export const metadata: Metadata = { title: "Clientes" };
export default function Page() { return <FeaturePage title="Clientes" description="Centralize informações, contatos e histórico de relacionamento dos clientes." icon="users" emptyTitle="Sua carteira de clientes aparecerá aqui" emptyDescription="Na próxima etapa, este espaço reunirá os clientes da RODE com busca, filtros e detalhes de relacionamento." />; }
