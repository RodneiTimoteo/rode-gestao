export function PageHeader({ title, description, eyebrow }: { title: string; description: string; eyebrow?: string }) {
  return <header className="mb-6 sm:mb-8">{eyebrow && <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand"><span className="h-px w-5 bg-brand/60" />{eyebrow}</p>}<h1 className="text-[28px] font-semibold tracking-[-0.04em] text-strong sm:text-[34px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">{description}</p></header>;
}
