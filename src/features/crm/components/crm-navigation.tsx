import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function CrmNavigation({ active }: { active: "clients" | "pipeline" }) {
  return (
    <nav aria-label="Navegação do CRM" className="mb-6 flex w-fit rounded-xl border border-line bg-surface p-1">
      <Link
        href="/clientes"
        aria-current={active === "clients" ? "page" : undefined}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active === "clients" ? "bg-brand-soft text-brand" : "text-muted hover:bg-soft hover:text-strong"}`}
      >
        <Icon name="users" className="size-4" /> Clientes
      </Link>
      <Link
        href="/clientes/funil"
        aria-current={active === "pipeline" ? "page" : undefined}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active === "pipeline" ? "bg-brand-soft text-brand" : "text-muted hover:bg-soft hover:text-strong"}`}
      >
        <Icon name="columns" className="size-4" /> Funil comercial
      </Link>
    </nav>
  );
}
