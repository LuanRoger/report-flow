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
  pondId: parseAsInteger,
  page: parseAsInteger.withDefault(1),
};

export const loadSearchParams = createLoader(pageQueryParams);
