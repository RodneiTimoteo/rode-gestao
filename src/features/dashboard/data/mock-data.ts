import type { Appointment, Metric, Task } from "@/features/dashboard/types";

export const metrics: Metric[] = [
  { label: "Clientes ativos", value: "48", detail: "3 novos neste mês", trend: "+6,7%", icon: "users" },
  { label: "Projetos ativos", value: "17", detail: "5 entregas próximas", icon: "projects" },
  { label: "Propostas em aberto", value: "9", detail: "R$ 84.500 em negociação", icon: "file" },
  { label: "Contas a receber", value: "R$ 32.480", detail: "Vencimento nos próximos 30 dias", icon: "wallet" },
  { label: "Receita recorrente", value: "R$ 18.900", detail: "12 contratos ativos", trend: "+4,2%", icon: "chart" },
];

export const revenue = [
  { month: "Mai", value: 48 }, { month: "Jun", value: 58 }, { month: "Jul", value: 51 },
  { month: "Ago", value: 71 }, { month: "Set", value: 67 }, { month: "Out", value: 84 },
];

export const tasks: Task[] = [
  { title: "Revisar escopo do portal", project: "Alvorada Engenharia", due: "Hoje, 16:00", priority: "Alta" },
  { title: "Enviar apresentação comercial", project: "Clínica Essere", due: "Amanhã, 10:30", priority: "Média" },
  { title: "Validar conteúdo da landing page", project: "Norte Solar", due: "11 out", priority: "Média" },
  { title: "Preparar relatório mensal", project: "RODE Manutenção", due: "13 out", priority: "Baixa" },
];

export const appointments: Appointment[] = [
  { day: "09", month: "OUT", time: "09:30", title: "Kickoff do projeto", type: "Alvorada Engenharia" },
  { day: "09", month: "OUT", time: "15:00", title: "Reunião de acompanhamento", type: "Norte Solar" },
  { day: "10", month: "OUT", time: "11:00", title: "Apresentação de proposta", type: "Clínica Essere" },
];
