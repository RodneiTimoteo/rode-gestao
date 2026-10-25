"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-2xl border border-danger/20 bg-danger-soft p-6"><h1 className="text-lg font-semibold text-danger">Não foi possível carregar os projetos</h1><p className="mt-2 text-sm text-danger">Tente novamente. Se o problema persistir, procure o suporte responsável pelo ambiente.</p><button onClick={reset} className="mt-4 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white">Tentar novamente</button></div>;
}
