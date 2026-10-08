import type { Metadata } from "next";
import { FeaturePage } from "@/features/shared/components/feature-page";
export const metadata: Metadata = { title: "Projetos" };
export default function Page() { return <FeaturePage title="Projetos" description="Acompanhe escopo, andamento, entregas e responsáveis por cada projeto." icon="projects" emptyTitle="Os projetos serão organizados neste espaço" emptyDescription="A estrutura está pronta para receber a visão de portfólio, etapas, responsáveis e prazos dos projetos." />; }
