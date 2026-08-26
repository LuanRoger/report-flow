import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { MeasurementsTable } from "./measurements-table";

function MeasurementsPageFallback() {
  return (
    <div className="space-y-5" role="status">
      <div className="space-y-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
      <span className="sr-only">Loading measurements</span>
    </div>
  );
}

export default function MeasurementsPage() {
  return (
    <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
      <Suspense fallback={<MeasurementsPageFallback />}>
        <MeasurementsTable />
      </Suspense>
    </main>
  );
}
