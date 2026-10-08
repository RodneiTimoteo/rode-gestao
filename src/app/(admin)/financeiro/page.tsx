import type { Metadata } from "next";
import { FeaturePage } from "@/features/shared/components/feature-page";
export const metadata: Metadata = { title: "Financeiro" };
export default function Page() { return <FeaturePage title="Financeiro" description="Tenha visibilidade de receitas, despesas e fluxo financeiro da operação." icon="wallet" emptyTitle="A visão financeira será exibida aqui" emptyDescription="Este módulo receberá contas a pagar e receber, categorias e indicadores — sem dados reais nesta versão." />; }
