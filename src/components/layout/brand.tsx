export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-sm font-bold tracking-[-0.08em] text-white" aria-hidden="true">R</div>{!compact && <div className="min-w-0 leading-none"><p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-strong">RODE Gestão</p><p className="mt-1.5 truncate text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">Soluções inteligentes</p></div>}</div>;
}
