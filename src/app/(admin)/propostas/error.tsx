"use client";
export default function ProposalsError({ reset }: { error: Error; reset: () => void }) { return <div role="alert" className="rounded-2xl border border-danger/20 bg-danger-soft p-6"><h1 className="font-semibold text-danger">Não foi possível carregar as propostas</h1><p className="mt-2 text-sm text-danger">Verifique sua conexão e tente novamente.</p><button onClick={reset} className="mt-4 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white">Tentar novamente</button></div>; }

