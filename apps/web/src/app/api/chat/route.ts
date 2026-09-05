import { chatSubmitRequestSchema } from "@/app/chat/schemas";
import { getAnalysisApi } from "@/lib/http";

const STREAM_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "connection",
  "x-vercel-ai-ui-message-stream",
  "x-accel-buffering",
] as const;

const textResponse = (message: string, status: number): Response =>
  new Response(message, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
    status,
  });

const getProxyHeaders = (upstreamHeaders: Headers): Headers => {
  const headers = new Headers();

  for (const headerName of STREAM_RESPONSE_HEADERS) {
    const headerValue = upstreamHeaders.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return headers;
};

export const POST = async (request: Request): Promise<Response> => {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return textResponse("A solicitação enviada é inválida.", 400);
  }

  const requestResult = chatSubmitRequestSchema.safeParse(requestBody);

  if (!requestResult.success) {
    return textResponse("A pergunta enviada é inválida.", 400);
  }

  try {
    const { message, pondId } = requestResult.data;
    const upstreamResponse = await getAnalysisApi().post(
      `/chats/ponds/${pondId}/messages`,
      {
        cache: "no-store",
        json: { message },
        signal: request.signal,
        throwHttpErrors: false,
      }
    );

    if (!upstreamResponse.ok) {
      const { status } = upstreamResponse;
      await upstreamResponse.body?.cancel();

      if (status === 404) {
        return textResponse("Viveiro não encontrado.", 404);
      }
      if (status === 409) {
        return textResponse(
          "A conversa está ocupada. Tente novamente em instantes.",
          409
        );
      }

      return textResponse(
        "Não foi possível consultar o assistente agora. Tente novamente em instantes.",
        502
      );
    }

    if (!upstreamResponse.body) {
      return textResponse(
        "O assistente não retornou uma resposta válida.",
        502
      );
    }

    return new Response(upstreamResponse.body, {
      headers: getProxyHeaders(upstreamResponse.headers),
      status: upstreamResponse.status,
    });
  } catch {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    return textResponse(
      "Não foi possível consultar o assistente agora. Tente novamente em instantes.",
      502
    );
  }
};
