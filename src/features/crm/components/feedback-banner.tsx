import { Icon } from "@/components/ui/icon";

const messages: Record<string, string> = {
  "client-created": "Cliente cadastrado com sucesso.",
  "client-updated": "Cadastro atualizado com sucesso.",
  "opportunity-created": "Oportunidade criada com sucesso.",
  "opportunity-updated": "Oportunidade atualizada com sucesso.",
  "activity-created": "Atividade registrada no histórico.",
  "proposal-created": "Proposta criada com sucesso.",
  "proposal-updated": "Proposta atualizada com sucesso.",
  "project-created": "Projeto cadastrado com sucesso.",
  "project-from-proposal": "Projeto criado a partir da proposta aprovada.",
  "project-existing": "Esta proposta já possuía um projeto. Abrimos o cadastro existente.",
  "project-stage-archived": "Etapa arquivada. As tarefas e o histórico foram preservados.",
};

export function FeedbackBanner({ code }: { code?: string }) {
  const message = code ? messages[code] : null;
  if (!message) return null;
  return (
    <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-positive/20 bg-positive-soft px-4 py-3 text-sm font-medium text-positive">
      <Icon name="check" className="size-4 shrink-0" /> {message}
    </div>
  );
}
