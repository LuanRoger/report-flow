import { PondChatOperationConflictError } from "../models/errors";

type PondChatOperation = "clearing" | "streaming";

interface ActivePondChatOperation {
  finished: Promise<void>;
  operation: PondChatOperation;
  token: symbol;
}

const POND_CHAT_OPERATION_DESCRIPTION = "pond-chat-operation";
const activeOperations = new Map<number, ActivePondChatOperation>();

export async function acquirePondChatOperation(
  pondId: number,
  operation: PondChatOperation
): Promise<() => void> {
  const activeOperation = activeOperations.get(pondId);

  if (activeOperation) {
    if (activeOperation.operation === "clearing" && operation === "streaming") {
      await activeOperation.finished;
      return await acquirePondChatOperation(pondId, operation);
    }

    throw new PondChatOperationConflictError();
  }

  let finishOperation: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finishOperation = resolve;
  });

  const lockToken = Symbol(POND_CHAT_OPERATION_DESCRIPTION);
  activeOperations.set(pondId, {
    finished,
    operation,
    token: lockToken,
  });

  let released = false;
  return () => {
    if (released) {
      return;
    }

    released = true;
    if (activeOperations.get(pondId)?.token === lockToken) {
      activeOperations.delete(pondId);
    }
    finishOperation();
  };
}
