import { createLoader, parseAsInteger } from "nuqs/server";

export const chatPageQueryParams = {
  pondId: parseAsInteger,
};

export const loadChatSearchParams = createLoader(chatPageQueryParams);
