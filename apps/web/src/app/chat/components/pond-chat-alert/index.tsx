import { MessageCircleWarningIcon } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";

interface PondChatAlertProps {
  doesHasPondId?: boolean;
  errorMessage: string;
}

export default function PondChatAlert({
  errorMessage,
  doesHasPondId,
}: PondChatAlertProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <MessageCircleWarningIcon />
          </EmptyMedia>
          <EmptyTitle>Atenção</EmptyTitle>
          <EmptyDescription>{errorMessage}</EmptyDescription>
        </EmptyHeader>
        {!doesHasPondId && (
          <EmptyContent>
            Especifique o ID do viveiro para continuar. <Kbd>?pondId=1</Kbd>
          </EmptyContent>
        )}
      </Empty>
    </div>
  );
}
