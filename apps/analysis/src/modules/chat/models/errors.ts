export class ChatPondNotFoundError extends Error {
  status = 404;

  constructor(pondId: number) {
    super(`Pond with ID '${pondId}' not found`);
    this.name = "ChatPondNotFoundError";
  }
}

export class PondChatNotFoundError extends Error {
  status = 404;

  constructor(pondId: number) {
    super(`Chat for pond with ID '${pondId}' not found`);
    this.name = "PondChatNotFoundError";
  }
}

export class ChatMessageConflictError extends Error {
  status = 409;

  constructor(messageId: string) {
    super(`Message ID '${messageId}' conflicts with an existing message`);
    this.name = "ChatMessageConflictError";
  }
}

export class ChatMessageAlreadySubmittedError extends Error {
  status = 409;

  constructor(messageId: string) {
    super(`Message ID '${messageId}' has already been submitted`);
    this.name = "ChatMessageAlreadySubmittedError";
  }
}

export class PondChatOperationConflictError extends Error {
  status = 409;

  constructor() {
    super("Another operation is already active for this pond chat");
    this.name = "PondChatOperationConflictError";
  }
}

export class InvalidPersistedChatHistoryError extends Error {
  status = 500;

  constructor(options: ErrorOptions) {
    super("Persisted chat history is invalid", options);
    this.name = "InvalidPersistedChatHistoryError";
  }
}
