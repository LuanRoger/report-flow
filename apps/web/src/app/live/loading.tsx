import { Skeleton } from "@/components/ui/skeleton";

const CHART_SKELETON_IDS = ["temperature", "turbidity", "oxygen"] as const;

export default function Loading() {
  return (
    <div className="space-y-6" role="status">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="grid gap-4 2xl:grid-cols-3">
        {CHART_SKELETON_IDS.map((chartId) => (
          <Skeleton className="h-96 rounded-xl" key={chartId} />
        ))}
      </div>
      <span className="sr-only">Loading live measurements</span>
    </div>
  );
}
