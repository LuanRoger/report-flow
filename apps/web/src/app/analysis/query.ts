import { createLoader, parseAsInteger } from "nuqs/server";

export const analysisPageQueryParams = {
  pondId: parseAsInteger,
};

export const loadSearchParams = createLoader(analysisPageQueryParams);
