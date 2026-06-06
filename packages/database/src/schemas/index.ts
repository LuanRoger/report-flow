import * as analysisEmbeddings from "./analysis-embeddings";
import * as analysisResults from "./analysis-results";
import * as measurements from "./measurements";
import * as pondCycles from "./pond-cycles";
import * as ponds from "./ponds";

export const schemas = {
	...ponds,
	...pondCycles,
	...measurements,
	...analysisResults,
	...analysisEmbeddings,
};

export * from "./analysis-embeddings";
export * from "./analysis-results";
export * from "./measurements";
export * from "./pond-cycles";
export * from "./ponds";
