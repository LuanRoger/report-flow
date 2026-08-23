import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { formatDate } from "@/utils/date";
import { AI_ANALYSIS_SUMMARY_SYSTEM_PROMPT } from "../constants";
import type { AnalysisResult } from "../repository/types";

function formatAnalysisContext(result: AnalysisResult): string {
	const { pondId, finalScore, metadata, startTime, endTime } = result;
	const { executionStats, parameterStats, criticalThreshold } = metadata;
	const { dataCoverage, timeRange, totalMeasurements } = executionStats;

	const parameterScores = {
		dissolvedOxygen: result.dissolvedOxygenScore,
		ph: result.phScore,
		salinity: result.salinityScore,
		temperature: result.temperatureScore,
		turbidity: result.turbidityScore,
	};

	const parameterAnalysis: string[] = [];
	const parameterCodes = Object.keys(parameterScores) as Array<
		keyof typeof parameterScores
	>;

	for (const paramCode of parameterCodes) {
		const score = parameterScores[paramCode];
		const stats = parameterStats[paramCode];
		const temporal = stats.temporalMetrics;

		const scoreDescription = getScoreDescription(score);
		const criticalInfo =
			temporal.criticalTimeRatio > 0.1
				? `, with ${(temporal.criticalTimeRatio * 100).toFixed(0)}% of readings in critical range`
				: "";

		parameterAnalysis.push(
			`${paramCode}: ${score.toFixed(0)}/100 (${scoreDescription}${criticalInfo})`
		);
	}

	const temporalSummary: string[] = [];
	for (const paramCode of parameterCodes) {
		const stats = parameterStats[paramCode];
		const temporal = stats.temporalMetrics;

		if (temporal.criticalCount > 0) {
			temporalSummary.push(
				`${paramCode} had ${temporal.criticalCount} critical readings`
			);
		}
	}

	return `
Analysis Context:
- Pond: ${pondId}
- Period: ${formatDate(startTime)} to ${formatDate(endTime)}
- Analysis Date Range: ${formatDate(timeRange.actualStart)} to ${formatDate(timeRange.actualEnd)}
- Total Measurements: ${totalMeasurements}
- Data Coverage: ${dataCoverage.coveragePercentage}% (${dataCoverage.presentParameters.length} parameters monitored)
- Overall Water Quality Score: ${finalScore.toFixed(1)}/100 (${getScoreDescription(finalScore)})
- Critical Threshold: ${criticalThreshold}/100

Parameter Performance:
${parameterAnalysis.join("\n")}

${temporalSummary.length > 0 ? `\nCritical Alerts:\n${temporalSummary.join("\n")}` : ""}

Configuration:
- Aggregation Weights: Alpha=${metadata.aggregationWeights.alpha}, Beta=${metadata.aggregationWeights.beta}, Gamma=${metadata.aggregationWeights.gamma}
- Parameter Weights: Temperature=${metadata.parameterWeights.temperature}, pH=${metadata.parameterWeights.ph}, Salinity=${metadata.parameterWeights.salinity}, Dissolved Oxygen=${metadata.parameterWeights.dissolvedOxygen}, Turbidity=${metadata.parameterWeights.turbidity}
`;
}

function getScoreDescription(score: number): string {
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

export async function generateAiSummary(
	result: AnalysisResult
): Promise<string> {
	const context = formatAnalysisContext(result);

	const { text } = await generateText({
		maxOutputTokens: 400,
		model: openai("gpt-4o-mini-2024-07-18"),
		prompt: `Please provide your professional analysis and advice for this pond:\n\n${context}\n\n`,
		system: AI_ANALYSIS_SUMMARY_SYSTEM_PROMPT,
	});

	return text;
}
