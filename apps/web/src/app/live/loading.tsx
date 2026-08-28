import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-2" role="status">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
				<div className="flex flex-col items-end gap-2">
					<Skeleton className="h-6 w-20 rounded-full" />
					<Skeleton className="h-4 w-52" />
        </div>
      </div>
      <div className="grid gap-4 2xl:grid-cols-2">
				<Skeleton className="h-96 rounded-xl" />
				<Skeleton className="h-96 rounded-xl" />
				<Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <span className="sr-only">Loading live measurements</span>
    </div>
  );
}
