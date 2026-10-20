export default function Loading() {
  return <div className="animate-pulse space-y-5" aria-label="Carregando projetos"><div className="h-9 w-52 rounded bg-soft" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-2xl bg-soft" />)}</div><div className="h-16 rounded-2xl bg-soft" />{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 rounded-2xl bg-soft" />)}</div>;
}
