import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface ChatHeaderProps {
  pondId: number;
  title: string;
  trailing?: ReactNode;
}

export default function ChatHeader({
  pondId,
  title,
  trailing,
}: ChatHeaderProps) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
      <SidebarTrigger />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-semibold text-base">{title}</h1>
        <p className="text-muted-foreground text-xs">Viveiro {pondId}</p>
      </div>
      {trailing}
    </header>
  );
}
