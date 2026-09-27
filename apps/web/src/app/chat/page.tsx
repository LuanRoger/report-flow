import { MessageCircle } from "lucide-react";
import { Suspense } from "react";
import PondsCyclesSelector from "@/components/ponds-cycles-selector";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { loadPondChat } from "./actions";
import { ChatShell } from "./components/chat-shell";
import PondChatAlert from "./components/pond-chat-alert";
import { MESSAGES } from "./constants";
import { loadChatSearchParams } from "./query";

const SelectorFallback = () => <Skeleton className="h-8 w-56" />;

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const { pondId } = await loadChatSearchParams(searchParams);
  const hasValidPond = pondId !== null && pondId >= 1;

  if (!hasValidPond) {
    return (
      <div className="flex size-full min-h-0 flex-col gap-6 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <header className="space-y-1">
          <h1 className="font-heading font-semibold text-2xl tracking-tight">
            Consultor
          </h1>
          <p className="text-muted-foreground text-sm">
            Converse sobre análises, qualidade da água e manejo do viveiro.
          </p>
        </header>

        <section aria-labelledby="chat-pond-selection" className="space-y-2">
          <div>
            <h2 className="font-medium text-sm" id="chat-pond-selection">
              Viveiro
            </h2>
            <p className="text-muted-foreground text-sm">
              Selecione o viveiro que será usado como contexto da conversa.
            </p>
          </div>
          <Suspense fallback={<SelectorFallback />}>
            <PondsCyclesSelector hideCycles pondId={pondId} />
          </Suspense>
        </section>

        <Empty className="min-h-72 flex-1 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageCircle />
            </EmptyMedia>
            <EmptyTitle>Selecione um viveiro</EmptyTitle>
            <EmptyDescription>
              O histórico e as sugestões do consultor aparecerão aqui após a
              seleção.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const { data, serverError } = await loadPondChat({ pondId });

  if (!data || serverError) {
    return (
      <PondChatAlert
        doesHasPondId
        errorMessage={serverError || MESSAGES.ERROR_CHAT_LOAD}
      />
    );
  }

  const { chat, messages } = data;
  return (
    <ChatShell
      chatId={chat.id}
      initialMessages={messages}
      key={chat.id}
      pondId={chat.pondId}
      title={chat.title}
    />
  );
}
