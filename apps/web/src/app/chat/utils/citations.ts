import type { SourceDocumentUIPart, UIMessage } from "ai";

const ANALYSIS_SOURCE_MEDIA_TYPE = "application/vnd.report-flow.analysis";
const CITATION_HREF_PREFIX = "#analysis-source-";
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const LEGACY_SOURCE_TITLE_PATTERN =
  /^Análise de (\d{4}-\d{2}-\d{2}) \| Período (\d{4}-\d{2}-\d{2}) a (\d{4}-\d{2}-\d{2}) \| Ciclo (não informado|[1-9]\d*)$/;
const RAW_CODE_TAG_PATTERN = /<\/?(?:code|pre)(?:\s[^>]*)?>/gi;
const SOURCE_ID_PATTERN = /^S[1-9]\d*$/;
const TEXT_CITATION_PATTERN = /\[(S[1-9]\d*)\]/g;

export interface AnalysisSourceMetadata {
  analysisCreatedAt: string;
  cycle: number | null;
  periodEnd: string;
  periodStart: string;
}

export interface AnalysisSource {
  metadata: AnalysisSourceMetadata;
  sourceId: string;
}

interface MarkdownPoint {
  offset?: number;
}

interface MarkdownNode {
  children?: MarkdownNode[];
  identifier?: string;
  label?: string;
  position?: {
    end: MarkdownPoint;
    start: MarkdownPoint;
  };
  referenceType?: "collapsed" | "full" | "shortcut";
  type: string;
  url?: string;
  value?: string;
}

interface MarkdownFile {
  value?: unknown;
}

interface SourceCharacter {
  isLiteral: boolean;
  rawIndex: number;
}

type MessagePart = UIMessage["parts"][number];
type CitationPlugin = () => (tree: MarkdownNode, file: MarkdownFile) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const parseStructuredMetadata = (
  source: SourceDocumentUIPart
): AnalysisSourceMetadata | undefined => {
  const metadata = source.providerMetadata?.reportFlow;

  if (!isRecord(metadata)) {
    return;
  }

  const { analysisCreatedAt, cycle, periodEnd, periodStart } = metadata;
  const hasValidCycle =
    cycle === null ||
    (typeof cycle === "number" && Number.isInteger(cycle) && cycle > 0);

  if (
    !(
      isIsoDate(analysisCreatedAt) &&
      isIsoDate(periodEnd) &&
      isIsoDate(periodStart) &&
      hasValidCycle
    )
  ) {
    return;
  }

  return {
    analysisCreatedAt,
    cycle,
    periodEnd,
    periodStart,
  };
};

const parseLegacyTitleMetadata = (
  title: string
): AnalysisSourceMetadata | undefined => {
  const match = LEGACY_SOURCE_TITLE_PATTERN.exec(title);
  const analysisCreatedAt = match?.[1];
  const periodStart = match?.[2];
  const periodEnd = match?.[3];
  const cycleLabel = match?.[4];

  if (
    !(
      isIsoDate(analysisCreatedAt) &&
      isIsoDate(periodStart) &&
      isIsoDate(periodEnd) &&
      cycleLabel
    )
  ) {
    return;
  }

  return {
    analysisCreatedAt,
    cycle: cycleLabel === "não informado" ? null : Number(cycleLabel),
    periodEnd,
    periodStart,
  };
};

const isAnalysisSourcePart = (
  part: MessagePart
): part is SourceDocumentUIPart =>
  part.type === "source-document" &&
  part.mediaType === ANALYSIS_SOURCE_MEDIA_TYPE &&
  SOURCE_ID_PATTERN.test(part.sourceId);

export const createAnalysisSourceMap = (
  parts: UIMessage["parts"]
): ReadonlyMap<string, AnalysisSource> => {
  const sources = new Map<string, AnalysisSource>();

  for (const part of parts) {
    if (!isAnalysisSourcePart(part) || sources.has(part.sourceId)) {
      continue;
    }

    const metadata =
      parseStructuredMetadata(part) ?? parseLegacyTitleMetadata(part.title);

    if (!metadata) {
      continue;
    }

    sources.set(part.sourceId, {
      metadata,
      sourceId: part.sourceId,
    });
  }

  return sources;
};

export const getCitationSourceIdFromHref = (
  href: string | undefined
): string | undefined => {
  if (!href?.startsWith(CITATION_HREF_PREFIX)) {
    return;
  }

  const sourceId = href.slice(CITATION_HREF_PREFIX.length);
  return SOURCE_ID_PATTERN.test(sourceId) ? sourceId : undefined;
};

const createTextNode = (value: string): MarkdownNode => ({
  type: "text",
  value,
});

const createCitationNode = (sourceId: string): MarkdownNode => ({
  children: [createTextNode(sourceId)],
  type: "link",
  url: `${CITATION_HREF_PREFIX}${sourceId}`,
});

const getLinkedSourceId = (node: MarkdownNode): string | undefined => {
  if (node.children?.length !== 1) {
    return;
  }

  const [child] = node.children;
  if (child?.type !== "text" || !child.value) {
    return;
  }

  return SOURCE_ID_PATTERN.test(child.value) ? child.value : undefined;
};

const getEntityEnd = (raw: string, start: number): number | undefined => {
  const end = raw.indexOf(";", start + 1);
  return end >= 0 && end - start <= 32 ? end : undefined;
};

const mapSourceCharacters = (
  raw: string,
  value: string
): Array<SourceCharacter | undefined> => {
  const characters: Array<SourceCharacter | undefined> = [];
  let rawIndex = 0;
  let valueIndex = 0;

  while (rawIndex < raw.length && valueIndex < value.length) {
    const rawCharacter = raw[rawIndex];
    const valueCharacter = value[valueIndex];
    const entityEnd =
      rawCharacter === "&" ? getEntityEnd(raw, rawIndex) : undefined;

    if (entityEnd !== undefined) {
      const entity = raw.slice(rawIndex, entityEnd + 1);
      if (!value.startsWith(entity, valueIndex)) {
        characters[valueIndex] = { isLiteral: false, rawIndex };
        rawIndex = entityEnd + 1;
        valueIndex += 1;
        continue;
      }
    }

    if (rawCharacter === "\\" && raw[rawIndex + 1] === valueCharacter) {
      characters[valueIndex] = { isLiteral: false, rawIndex: rawIndex + 1 };
      rawIndex += 2;
      valueIndex += 1;
      continue;
    }

    if (rawCharacter === valueCharacter) {
      characters[valueIndex] = { isLiteral: true, rawIndex };
      rawIndex += 1;
      valueIndex += 1;
      continue;
    }

    const nextRawIndex = raw.indexOf(valueCharacter ?? "", rawIndex + 1);
    if (nextRawIndex >= 0) {
      rawIndex = nextRawIndex;
      continue;
    }

    valueIndex += 1;
  }

  return characters;
};

const getNodeSourceCharacters = (
  node: MarkdownNode,
  markdown: string | undefined
): Array<SourceCharacter | undefined> | undefined => {
  if (!(node.value && markdown && node.position)) {
    return;
  }

  const { end, start } = node.position;
  if (typeof start.offset !== "number" || typeof end.offset !== "number") {
    return;
  }

  return mapSourceCharacters(
    markdown.slice(start.offset, end.offset),
    node.value
  );
};

const isLiteralCitation = (
  characters: Array<SourceCharacter | undefined>,
  start: number,
  length: number
): boolean => {
  const citationCharacters = characters.slice(start, start + length);
  const [firstCharacter] = citationCharacters;

  return Boolean(
    firstCharacter?.isLiteral &&
      citationCharacters.length === length &&
      citationCharacters.every(
        (character, index) =>
          character?.isLiteral &&
          character.rawIndex === firstCharacter.rawIndex + index
      )
  );
};

const transformTextNode = (
  node: MarkdownNode,
  sources: ReadonlyMap<string, AnalysisSource>,
  markdown: string | undefined
): MarkdownNode[] => {
  const { value } = node;
  const sourceCharacters = getNodeSourceCharacters(node, markdown);
  if (!(value && sourceCharacters)) {
    return [node];
  }

  const transformed: MarkdownNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(TEXT_CITATION_PATTERN)) {
    const [fullMatch, sourceId] = match;
    const matchIndex = match.index;

    if (
      !(
        sourceId &&
        sources.has(sourceId) &&
        isLiteralCitation(sourceCharacters, matchIndex, fullMatch.length)
      )
    ) {
      continue;
    }

    if (matchIndex > cursor) {
      transformed.push(createTextNode(value.slice(cursor, matchIndex)));
    }

    transformed.push(createCitationNode(sourceId));
    cursor = matchIndex + fullMatch.length;
  }

  if (cursor === 0) {
    return [node];
  }

  if (cursor < value.length) {
    transformed.push(createTextNode(value.slice(cursor)));
  }

  return transformed;
};

const transformSourceLink = (
  node: MarkdownNode,
  sources: ReadonlyMap<string, AnalysisSource>
): MarkdownNode[] | undefined => {
  const sourceId = getLinkedSourceId(node);

  if (!sourceId) {
    return;
  }

  if (!sources.has(sourceId)) {
    const referenceLabel =
      node.type === "linkReference" && node.referenceType === "full"
        ? `[${node.label ?? node.identifier ?? ""}]`
        : "";
    return [createTextNode(`[${sourceId}]${referenceLabel}`)];
  }

  const transformed = [createCitationNode(sourceId)];
  const referenceSourceId =
    node.type === "linkReference" && node.referenceType === "full"
      ? node.label
      : undefined;

  if (referenceSourceId && SOURCE_ID_PATTERN.test(referenceSourceId)) {
    transformed.push(
      sources.has(referenceSourceId)
        ? createCitationNode(referenceSourceId)
        : createTextNode(`[${referenceSourceId}]`)
    );
  }

  return transformed;
};

const getRawCodeDepthChange = (html: string): number => {
  const trimmedHtml = html.trimStart();
  if (trimmedHtml.startsWith("<!--") && !trimmedHtml.includes("-->")) {
    return 0;
  }

  const htmlWithoutComments = html.replace(HTML_COMMENT_PATTERN, "");
  let change = 0;

  for (const match of htmlWithoutComments.matchAll(RAW_CODE_TAG_PATTERN)) {
    const [tag] = match;

    if (tag.endsWith("/>")) {
      continue;
    }

    change += tag.startsWith("</") ? -1 : 1;
  }

  return change;
};

const transformChildren = (
  parent: MarkdownNode,
  sources: ReadonlyMap<string, AnalysisSource>,
  markdown: string | undefined
): void => {
  if (!parent.children) {
    return;
  }

  const transformed: MarkdownNode[] = [];
  let rawCodeDepth = 0;

  for (const node of parent.children) {
    if (node.type === "html" && node.value) {
      rawCodeDepth = Math.max(
        0,
        rawCodeDepth + getRawCodeDepthChange(node.value)
      );
      transformed.push(node);
      continue;
    }

    if (rawCodeDepth > 0) {
      transformed.push(node);
      continue;
    }

    if (node.type === "text") {
      transformed.push(...transformTextNode(node, sources, markdown));
      continue;
    }

    if (node.type === "link" || node.type === "linkReference") {
      const sourceLink = transformSourceLink(node, sources);
      transformed.push(...(sourceLink ?? [node]));
      continue;
    }

    transformChildren(node, sources, markdown);
    transformed.push(node);
  }

  parent.children = transformed;
};

export const createAnalysisCitationPlugin = (
  sources: ReadonlyMap<string, AnalysisSource>
): CitationPlugin =>
  function analysisCitationPlugin() {
    return (tree, file) => {
      const markdown = typeof file.value === "string" ? file.value : undefined;
      transformChildren(tree, sources, markdown);
    };
  };
