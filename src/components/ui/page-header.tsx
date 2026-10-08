export function PageHeader({ title, description, eyebrow }: { title: string; description: string; eyebrow?: string }) {
  return <header className="mb-6 sm:mb-8">{eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</p>}<h1 className="text-[26px] font-semibold tracking-[-0.035em] text-strong sm:text-[30px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">{description}</p></header>;
}
