import { Field, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import type { CrmMember } from "@/features/crm/types";
import { projectTaskDefaultPriority } from "@/features/projects/constants";

export function ProjectTaskFields({ idPrefix, members, fieldErrors }: {
  idPrefix: string;
  members: CrmMember[];
  fieldErrors?: Record<string, string>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Título da tarefa *" htmlFor={`${idPrefix}-title`} error={fieldErrors?.title}>
        <input autoFocus className={inputClassName} id={`${idPrefix}-title`} name="title" required minLength={1} maxLength={300} />
      </Field>
      <Field label="Prioridade *" htmlFor={`${idPrefix}-priority`} error={fieldErrors?.priority}>
        <select className={inputClassName} id={`${idPrefix}-priority`} name="priority" required defaultValue={projectTaskDefaultPriority}>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Descrição" htmlFor={`${idPrefix}-description`} error={fieldErrors?.description} hint="Opcional. Até 8.000 caracteres.">
          <textarea className={`${textareaClassName} min-h-20`} id={`${idPrefix}-description`} name="description" maxLength={8000} placeholder="Descreva o resultado esperado desta tarefa." />
        </Field>
      </div>
      <Field label="Responsável" htmlFor={`${idPrefix}-assigned-to`} error={fieldErrors?.assigned_to}>
        <select className={inputClassName} id={`${idPrefix}-assigned-to`} name="assigned_to" defaultValue="">
          <option value="">Não atribuído</option>
          {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
        </select>
      </Field>
      <Field label="Prazo de entrega" htmlFor={`${idPrefix}-due-date`} error={fieldErrors?.due_date}>
        <input className={inputClassName} id={`${idPrefix}-due-date`} name="due_date" type="date" />
      </Field>
    </div>
  );
}
