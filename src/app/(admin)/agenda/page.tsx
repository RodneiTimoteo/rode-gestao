import type { Metadata } from "next";
import { FeaturePage } from "@/features/shared/components/feature-page";
export const metadata: Metadata = { title: "Agenda" };
export default function Page() { return <FeaturePage title="Agenda" description="Consulte reuniões, entregas e compromissos importantes da equipe." icon="calendar" emptyTitle="Seus compromissos serão organizados aqui" emptyDescription="A agenda será conectada às atividades do sistema em uma etapa futura. Nenhum evento está sendo salvo agora." />; }
