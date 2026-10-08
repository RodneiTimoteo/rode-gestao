import type { IconName } from "@/components/ui/icon";

export type Metric = { label: string; value: string; detail: string; trend?: string; icon: IconName };
export type Task = { title: string; project: string; due: string; priority: "Alta" | "Média" | "Baixa" };
export type Appointment = { day: string; month: string; time: string; title: string; type: string };
