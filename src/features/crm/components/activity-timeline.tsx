import { Icon, type IconName } from "@/components/ui/icon";
import { activityTypeLabels } from "@/features/crm/constants";
import { formatDateTime } from "@/features/crm/format";
import type { ActivityType, ActivityView } from "@/features/crm/types";

const activityIcons: Record<ActivityType, IconName> = { call: "phone", email: "mail", meeting: "calendar", note: "file", proposal: "briefcase", message: "message", other: "clock" };

export function ActivityTimeline({ activities }: { activities: ActivityView[] }) {
  if (!activities.length) return <p className="rounded-xl bg-soft px-4 py-6 text-center text-sm text-muted">O histórico ainda está vazio. Registre a primeira interação.</p>;
  return (
    <ol className="space-y-0">
      {activities.map((activity, index) => (
        <li key={activity.id} className="relative flex gap-4 pb-6 last:pb-0">
          {index < activities.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-20px)] w-px bg-line" />}
          <div className="z-10 grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-brand"><Icon name={activityIcons[activity.activity_type]} className="size-4" /></div>
          <div className="min-w-0 flex-1 pt-0.5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-strong">{activityTypeLabels[activity.activity_type]}</p><time className="text-xs text-subtle">{formatDateTime(activity.occurred_at)}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">{activity.description}</p><p className="mt-2 text-xs text-subtle">Por {activity.authorName}{activity.opportunityTitle ? ` · ${activity.opportunityTitle}` : ""}</p></div>
        </li>
      ))}
    </ol>
  );
}
