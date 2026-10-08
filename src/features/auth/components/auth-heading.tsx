export function AuthHeading({ title, description }: { title: string; description: string }) {
  return <header className="mb-8"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">Acesso seguro</p><h1 className="text-3xl font-semibold tracking-[-0.04em] text-strong">{title}</h1><p className="mt-3 text-sm leading-6 text-muted">{description}</p></header>;
}
