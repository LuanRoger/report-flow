import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import { formatDate } from "@/utils/date";
import { ANALYSIS_EMBEDDING_DIMENSIONS } from "../constants";
import type { ScoreResult } from "../schemas/types";

function getScoreLabel(score: number): string {
	if (score >= 90) {
		return "Excellent";
	}
	if (score >= 80) {
		return "Very Good";
	}
	if (score >= 70) {
		return "Good";
	}
	if (score >= 60) {
		return "Fair";
	}
	if (score >= 40) {
		return "Poor";
	}
	if (score >= 20) {
		return "Very Poor";
	}
	return "Critical";
}

export function formatAnalysisForEmbedding(result: ScoreResult): string {
	const { pondId, finalScore, parameterScores, metadata } = result;
	const { executionStats, parameterStats, criticalThreshold } = metadata;
	const { dataCoverage, timeRange, totalMeasurements } = executionStats;

	// Build parameter descriptions
	const parameterDescriptions: string[] = [];
	const parameterCodes = Object.keys(parameterScores) as Array<
		keyof typeof parameterScores
	>;

	for (const paramCode of parameterCodes) {
		const score = parameterScores[paramCode];
		const stats = parameterStats[paramCode];
		const temporal = stats.temporalMetrics;

		const scoreLabel = getScoreLabel(score);

		parameterDescriptions.push(
			`${paramCode}: score=${score.toFixed(0)}/${scoreLabel}, ` +
				`mean=${stats.rawValues.mean?.toFixed(2) ?? "N/A"}, ` +
				`min=${stats.rawValues.min?.toFixed(2) ?? "N/A"}, ` +
				`max=${stats.rawValues.max?.toFixed(2) ?? "N/A"}, ` +
				`count=${stats.rawValues.count}, ` +
				`critical=${(temporal.criticalTimeRatio * 100).toFixed(1)}%`
		);
	}

	return `
Pond Analysis: ${pondId}
Period: ${formatDate(timeRange.requestedStart)} to ${formatDate(timeRange.requestedEnd)}
Actual Data: ${formatDate(timeRange.actualStart)} to ${formatDate(timeRange.actualEnd)}

Overall Score: ${finalScore.toFixed(1)}/${getScoreLabel(finalScore)}
Total Measurements: ${totalMeasurements}
Data Coverage: ${dataCoverage.coveragePercentage}% (${dataCoverage.presentParameters.length} parameters)
Critical Threshold: ${criticalThreshold}

Parameters:
${parameterDescriptions.join("\n")}

Configuration:
Aggregation Weights: Alpha=${metadata.aggregationWeights.alpha}, Beta=${metadata.aggregationWeights.beta}, Gamma=${metadata.aggregationWeights.gamma}
Parameter Weights: Temperature=${metadata.parameterWeights.temperature}, pH=${metadata.parameterWeights.ph}, Salinity=${metadata.parameterWeights.salinity}, Dissolved Oxygen=${metadata.parameterWeights.dissolvedOxygen}, Turbidity=${metadata.parameterWeights.turbidity}
`;
}

export async function generateEmbedding(text: string): Promise<number[]> {
	const { embedding } = await embed({
		model: openai.embeddingModel("text-embedding-3-small"),
		providerOptions: {
			openai: {
				dimensions: ANALYSIS_EMBEDDING_DIMENSIONS,
			},
		},
		value: text,
	});

	return embedding;
}
