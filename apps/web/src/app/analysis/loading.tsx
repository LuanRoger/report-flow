import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" role="status">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <span className="sr-only">Carregando análises</span>
    </div>
  );
}
