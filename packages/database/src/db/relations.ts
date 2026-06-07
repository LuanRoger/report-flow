import { defineRelations } from "drizzle-orm";
import * as analysisEmbeddings from "../schemas/analysis-embeddings";
import * as analysisResults from "../schemas/analysis-results";
import * as measurements from "../schemas/measurements";
import * as pondCycles from "../schemas/pond-cycles";
import * as ponds from "../schemas/ponds";

export const schemas = {
	...ponds,
	...pondCycles,
	...measurements,
	...analysisResults,
	...analysisEmbeddings,
};

export const relations = defineRelations(schemas, (relation) => ({
	pondCycles: {
		pond: relation.one.ponds({
			from: relation.pondCycles.pondId,
			to: relation.ponds.id,
		}),
	},
	measurements: {
		pond: relation.one.ponds({
			from: relation.measurements.pondId,
			to: relation.ponds.id,
		}),
	},
	analysisResults: {
		pond: relation.one.ponds({
			from: relation.analysisResults.pondId,
			to: relation.ponds.id,
		}),
	},
	analysisEmbeddings: {
		analysis: relation.one.analysisResults({
			from: relation.analysisEmbeddings.analysisId,
			to: relation.analysisResults.id,
		}),
	},
}));
