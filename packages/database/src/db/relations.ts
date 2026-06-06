import { defineRelations } from "drizzle-orm";
import { schemas } from "../schemas";

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
