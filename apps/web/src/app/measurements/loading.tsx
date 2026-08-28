import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-5" role="status">
      <div className="space-y-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
