import { FileQuestion, List } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function NotFound() {
  return (
    <Empty className="min-h-[60vh] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestion />
        </EmptyMedia>
        <EmptyTitle>Análise não encontrada</EmptyTitle>
        <EmptyDescription>
          O identificador informado não existe ou a análise foi removida.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/analysis">
            <List data-icon="inline-start" />
            Ver análises
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
