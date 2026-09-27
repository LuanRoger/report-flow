import {
  createLoader,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
} from "nuqs/server";

export const pageQueryParams = {
  cursor: parseAsString,
  cursorHistory: parseAsArrayOf(parseAsString).withDefault([]),
  cycleId: parseAsInteger,
  page: parseAsInteger.withDefault(1),
  pondId: parseAsInteger,
};

export const loadSearchParams = createLoader(pageQueryParams);
