"use client";

import { Icon } from "@/components/ui/icon";

export default function ClientsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="grid min-h-[420px] place-items-center rounded-2xl border border-line bg-surface px-6 text-center"><div className="max-w-md"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger"><Icon name="close" className="size-6" /></div><h1 className="mt-5 text-xl font-semibold text-strong">Não foi possível carregar o CRM</h1><p className="mt-2 text-sm leading-6 text-muted">A conexão pode estar indisponível ou seu acesso mudou. Nenhum dado foi alterado.</p><button type="button" onClick={reset} className="mt-5 h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong">Tentar novamente</button></div></section>;
}
