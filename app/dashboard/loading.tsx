import { PageSkeleton } from "@/components/loading-skeleton";

export default function DashboardLoading() {
  return <PageSkeleton tiles={5} cards={4} />;
}
