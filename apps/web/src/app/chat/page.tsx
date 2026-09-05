import { loadPondChat } from "./actions";
import { ChatShell } from "./components/chat-shell";
import PondChatAlert from "./components/pond-chat-alert";
import { MESSAGES } from "./constants";
import { loadChatSearchParams } from "./query";

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const { pondId } = await loadChatSearchParams(searchParams);

  if (pondId === null) {
    return (
      <PondChatAlert
        doesHasPondId={false}
        errorMessage={MESSAGES.ERROR_POND_ID_NOT_SPECIFIED}
      />
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
