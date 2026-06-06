import { defineRelations } from "drizzle-orm";
import { schemas } from "../schemas";

export const relations = defineRelations(schemas, (relation) => ({
	pondCycles: {
		pond: relation.one.ponds({
			from: relation.ponds.id,
			to: relation.pondCycles.pondId,
		}),
	},
	measurements: {
		pond: relation.one.ponds({
			from: relation.ponds.id,
			to: relation.measurements.pondId,
		}),
	},
	analysisResults: {
		pond: relation.one.ponds({
			from: relation.ponds.id,
			to: relation.analysisResults.pondId,
		}),
	},
	analysisEmbeddings: {
		analysis: relation.one.analysisResults({
			from: relation.analysisResults.id,
			to: relation.analysisEmbeddings.analysisId,
		}),
	},
}));
