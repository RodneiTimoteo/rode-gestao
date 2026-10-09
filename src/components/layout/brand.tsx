import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-brand/25 bg-[#171715] shadow-sm"><Image src="/brand/rode-symbol.png" alt="" width={58} height={39} className="h-8 w-12 object-contain" priority /></div>{!compact && <div className="min-w-0 leading-none"><p className="truncate text-[15px] font-semibold tracking-[0.01em] text-strong">RODE Gestão</p><p className="mt-1.5 truncate text-[9px] font-semibold uppercase tracking-[0.2em] text-brand">Soluções inteligentes</p></div>}</div>;
}
