import type { NavigationItem } from "@/types/navigation";

export const primaryNavigation: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Clientes", href: "/clientes", icon: "users" },
  { label: "Projetos", href: "/projetos", icon: "projects" },
  { label: "Propostas", href: "/propostas", icon: "file" },
  { label: "Financeiro", href: "/financeiro", icon: "wallet" },
  { label: "Manutenção", href: "/manutencao", icon: "maintenance" },
  { label: "Agenda", href: "/agenda", icon: "calendar" },
  { label: "Relatórios", href: "/relatorios", icon: "chart" },
];

export const secondaryNavigation: NavigationItem[] = [
  { label: "Configurações", href: "/configuracoes", icon: "settings" },
];

export const allNavigation = [...primaryNavigation, ...secondaryNavigation];
