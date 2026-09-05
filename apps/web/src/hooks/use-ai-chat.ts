import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useAction } from "next-safe-action/hooks";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { clearPondChatHistory } from "@/app/chat/actions";
import { removeIncompleteAssistant } from "@/app/chat/components/chat-shell/utils";
import { generateMessageId } from "@/lib/utils/crypto";

interface UseAiChatProps {
  chatId: number;
  initialMessages: UIMessage[];
  pondId: number;
}

export function useAiChat({ chatId, initialMessages, pondId }: UseAiChatProps) {
  const [input, setInput] = useState<string>("");

  const { executeAsync: deleteChatHistory, isExecuting: isClearingHistory } =
    useAction(clearPondChatHistory, {
      onError: () => {
        toast.error("Não foi possível limpar o histórico de chat.");
      },
      onSuccess: () => {
        setMessages([]);
        toast.info("O histórico de chat foi limpo.");
      },
    });

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        body: { pondId },
        prepareSendMessagesRequest: ({ messages: requestMessages }) => ({
          body: {
            message: requestMessages.at(-1),
            pondId,
          },
        }),
      }),
    [pondId]
  );
  const { messages, sendMessage, setMessages, status, stop } =
    useChat<UIMessage>({
      generateId: generateMessageId,
      id: String(chatId),
      messages: initialMessages,
      onError: (error) => {
        toast.error(`Não foi possível concluir a resposta: ${error.message}`);
      },
      transport,
    });

  const isGenerating = status === "submitted" || status === "streaming";
  const isInteractionBlocked = isGenerating || isClearingHistory;

  const sendText = useCallback(
    async (text: string): Promise<void> => {
      if (isInteractionBlocked || status === "error") {
        return;
      }

      await sendMessage({
        parts: [{ text, type: "text" }],
        role: "user",
      });
    },
    [isInteractionBlocked, sendMessage, status]
  );

  const handleSubmit = useCallback(
    async ({ text }: { files: unknown[]; text: string }): Promise<void> => {
      const trimmedText = text.trim();
      if (!trimmedText) {
        return;
      }

      await sendText(trimmedText);
      setInput("");
    },
    [sendText]
  );

  const handleSuggestionSelect = useCallback(
    async (suggestion: string): Promise<void> => {
      await sendText(suggestion);
    },
    [sendText]
  );

  const handleStop = useCallback(async (): Promise<void> => {
    await stop();
    setMessages(removeIncompleteAssistant);
    toast.info(
      "A geração foi interrompida. Você pode enviar uma nova pergunta."
    );
  }, [setMessages, stop]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>): void => {
      setInput(event.currentTarget.value);
    },
    []
  );

  const handleClearHistory = useCallback(async (): Promise<void> => {
    await deleteChatHistory({ pondId });
  }, [deleteChatHistory, pondId]);

  return {
    handleClearHistory,
    handleInputChange,
    handleStop,
    handleSubmit,
    handleSuggestionSelect,
    input,
    isClearingHistory,
    isGenerating,
    isInteractionBlocked,
    messages,
    status,
  };
}
