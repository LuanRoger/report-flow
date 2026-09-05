import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando conversa"
      className="flex size-full min-h-0 flex-col bg-background"
      role="status"
    >
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
        <Skeleton className="size-7 rounded-md" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-7 w-28 rounded-md" />
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 sm:px-6">
          <div className="w-full max-w-xl space-y-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-9 w-44 rounded-md" />
          </div>

          <div className="ml-auto w-2/3 max-w-md rounded-lg bg-secondary p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/5" />
          </div>

          <div className="w-full max-w-2xl space-y-2.5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-3 h-10 w-52 rounded-md" />
          </div>

          <div className="ml-auto w-1/2 max-w-sm rounded-lg bg-secondary p-4">
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-3 w-40" />
        </div>
      </footer>

      <span className="sr-only">Carregando o histórico da conversa…</span>
    </div>
  );
}
