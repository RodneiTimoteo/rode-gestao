import type { Metadata } from "next";
import { FeaturePage } from "@/features/shared/components/feature-page";
export const metadata: Metadata = { title: "Relatórios" };
export default function Page() { return <FeaturePage title="Relatórios" description="Analise resultados comerciais, operacionais e financeiros em um só lugar." icon="chart" emptyTitle="Relatórios consolidados ficarão aqui" emptyDescription="Esta área receberá visões analíticas e filtros quando os módulos operacionais estiverem integrados ao banco." />; }
