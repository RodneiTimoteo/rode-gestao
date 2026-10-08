import type { Metadata } from "next";
import { FeaturePage } from "@/features/shared/components/feature-page";
export const metadata: Metadata = { title: "Manutenção" };
export default function Page() { return <FeaturePage title="Planos de manutenção" description="Acompanhe contratos recorrentes, vigências e atividades de manutenção." icon="maintenance" emptyTitle="Os planos de manutenção aparecerão aqui" emptyDescription="A área está preparada para organizar clientes recorrentes, planos contratados, renovações e atendimentos." />; }
