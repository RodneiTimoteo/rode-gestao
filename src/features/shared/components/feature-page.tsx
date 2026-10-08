import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { IconName } from "@/components/ui/icon";

type Props = { title: string; description: string; icon: IconName; emptyTitle: string; emptyDescription: string };
export function FeaturePage(props: Props) {
  return <><PageHeader title={props.title} description={props.description} /><EmptyState icon={props.icon} title={props.emptyTitle} description={props.emptyDescription} /></>;
}
