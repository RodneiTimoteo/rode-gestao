import { Field, inputClassName, textareaClassName } from "@/features/crm/components/form-controls";
import type { CrmMember } from "@/features/crm/types";
import type { ProjectStageRecord } from "@/features/projects/types";

type StageFieldValues = Pick<
  ProjectStageRecord,
  "name" | "description" | "responsible_user_id" | "planned_start_date" | "planned_end_date"
>;

export function ProjectStageFields({
  idPrefix,
  members,
  fieldErrors,
  values,
  autoFocusName = false,
}: {
  idPrefix: string;
  members: CrmMember[];
  fieldErrors?: Record<string, string>;
  values?: StageFieldValues;
  autoFocusName?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Nome da etapa *" htmlFor={`${idPrefix}-name`} error={fieldErrors?.name}>
        <input autoFocus={autoFocusName} className={inputClassName} id={`${idPrefix}-name`} name="name" required minLength={1} maxLength={200} defaultValue={values?.name ?? ""} />
      </Field>
      <Field label="Responsável" htmlFor={`${idPrefix}-responsible`} error={fieldErrors?.responsible_user_id}>
        <select className={inputClassName} id={`${idPrefix}-responsible`} name="responsible_user_id" defaultValue={values?.responsible_user_id ?? ""}>
          <option value="">Não atribuído</option>
          {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Descrição" htmlFor={`${idPrefix}-description`} error={fieldErrors?.description} hint="Opcional. Até 8.000 caracteres.">
          <textarea className={`${textareaClassName} min-h-24`} id={`${idPrefix}-description`} name="description" maxLength={8000} defaultValue={values?.description ?? ""} placeholder="Descreva o objetivo e as entregas desta etapa." />
        </Field>
      </div>
      <Field label="Data inicial planejada" htmlFor={`${idPrefix}-start-date`} error={fieldErrors?.planned_start_date}>
        <input className={inputClassName} id={`${idPrefix}-start-date`} name="planned_start_date" type="date" defaultValue={values?.planned_start_date ?? ""} />
      </Field>
      <Field label="Data final planejada" htmlFor={`${idPrefix}-end-date`} error={fieldErrors?.planned_end_date}>
        <input className={inputClassName} id={`${idPrefix}-end-date`} name="planned_end_date" type="date" defaultValue={values?.planned_end_date ?? ""} />
      </Field>
    </div>
  );
}
