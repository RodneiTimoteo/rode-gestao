import { Icon } from "@/components/ui/icon";

const messages: Record<string, string> = {
  "client-created": "Cliente cadastrado com sucesso.",
  "client-updated": "Cadastro atualizado com sucesso.",
  "opportunity-created": "Oportunidade criada com sucesso.",
  "opportunity-updated": "Oportunidade atualizada com sucesso.",
  "activity-created": "Atividade registrada no histórico.",
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
