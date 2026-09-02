import { PondChatOperationConflictError } from "../models/errors";

type PondChatOperation = "clearing" | "streaming";

interface ActivePondChatOperation {
  finished: Promise<void>;
  operation: PondChatOperation;
  token: symbol;
}

const activeOperations = new Map<number, ActivePondChatOperation>();

export const acquirePondChatOperation = async (
  pondId: number,
  operation: PondChatOperation
): Promise<() => void> => {
  const activeOperation = activeOperations.get(pondId);

  if (activeOperation) {
    if (activeOperation.operation === "clearing" && operation === "streaming") {
      await activeOperation.finished;
      return await acquirePondChatOperation(pondId, operation);
    }

    throw new PondChatOperationConflictError();
  }

  const token = Symbol("pond-chat-operation");
  let finishOperation: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finishOperation = resolve;
  });

  activeOperations.set(pondId, { finished, operation, token });

  let released = false;
  return () => {
    if (released) {
      return;
    }

    released = true;
    if (activeOperations.get(pondId)?.token === token) {
      activeOperations.delete(pondId);
    }
    finishOperation();
  };
};
