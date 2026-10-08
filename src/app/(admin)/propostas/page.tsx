import type { Metadata } from "next";
import { FeaturePage } from "@/features/shared/components/feature-page";
export const metadata: Metadata = { title: "Propostas" };
export default function Page() { return <FeaturePage title="Propostas" description="Visualize o pipeline comercial e acompanhe o status das propostas enviadas." icon="file" emptyTitle="O pipeline de propostas ficará aqui" emptyDescription="Em uma próxima etapa, você poderá acompanhar propostas por fase, valor, cliente e prazo de validade." />; }
