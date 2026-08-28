import { createLoader, parseAsInteger } from "nuqs/server";

export const livePageQueryParams = {
  pondId: parseAsInteger,
};

export const loadLiveSearchParams = createLoader(livePageQueryParams);
