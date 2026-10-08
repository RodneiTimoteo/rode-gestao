import { Icon } from "@/components/ui/icon";

export function NoOrganizationState() {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-2xl border border-line bg-surface px-6 py-14 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning-soft text-warning"><Icon name="building" className="size-6" /></div>
        <h1 className="mt-5 text-xl font-semibold text-strong">Nenhuma organização ativa</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Sua conta está autenticada, mas ainda não possui um vínculo ativo. Peça ao administrador da RODE para revisar seu acesso.</p>
      </div>
    </section>
  );
}
