import { MistralLanguageModelOptions, mistral } from "@ai-sdk/mistral";
import { generateText } from "ai";
import { ENV } from "varlock/env";
import type { PondScoreResult } from "../schemas/types";

// System prompt for the AI to act as a shrimp farm advisor
const SYSTEM_PROMPT = `
You are an expert shrimp farm advisor with years of experience in aquaculture and water quality management.
Your role is to analyze pond water quality data and provide professional, actionable advice to shrimp farmers.

You will receive analysis results containing:
- Pond ID and analysis period
- Final water quality score (1-100, where 100 is optimal)
- Individual parameter scores (temperature, pH, salinity, dissolved oxygen, turbidity)
- Statistical data for each parameter (min, max, mean values)
- Temporal metrics (mean score, min score, critical time ratio, critical count)
- Data coverage information
- Analysis configuration details

Based on this information, provide a concise but informative summary that includes:
1. An overall assessment of the pond's water quality
2. Key strengths (parameters performing well)
3. Areas of concern (parameters with low scores or high critical time ratios)
4. General recommendations for improvement

IMPORTANT GUIDELINES:
- Be specific and professional in your advice
- Reference actual parameter names and their performance
- Use clear, actionable language
- Keep the summary concise (3-5 sentences maximum)
- Do NOT make up specific numerical values - only reference what's provided in the context
- If a parameter has a low score or high critical time ratio, mention it specifically
- If all parameters are performing well, acknowledge this
- Always end with a positive, encouraging note

Remember: You are advising real shrimp farmers who rely on your expertise to maintain healthy ponds and successful harvests.
Output: Must generate the response in Portuguese (Brasil)
`;

/**
 * Format the analysis result into a context string for the AI
 * This provides structured information without raw database values
 */
function formatAnalysisContext(result: PondScoreResult): string {
	const { pondId, startDate, endDate, finalScore, parameterScores, metadata } =
		result;
	const { executionStats, parameterStats, criticalThreshold } = metadata;
	const { dataCoverage, timeRange, totalMeasurements } = executionStats;

	// Format date range
	const formatDate = (date: Date | null): string => {
		if (!date) return "N/A";
		return date.toISOString().split("T")[0];
	};

	// Build parameter analysis
	const parameterAnalysis = [];
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
			`${paramCode}: ${score.toFixed(0)}/100 (${scoreDescription}${criticalInfo})`,
		);
	}

	// Build temporal metrics summary
	const temporalSummary = [];
	for (const paramCode of parameterCodes) {
		const stats = parameterStats[paramCode];
		const temporal = stats.temporalMetrics;

		if (temporal.criticalCount > 0) {
			temporalSummary.push(
				`${paramCode} had ${temporal.criticalCount} critical readings`,
			);
		}
	}

	return `
Analysis Context:
- Pond: ${pondId}
- Period: ${formatDate(timeRange.requestedStart)} to ${formatDate(timeRange.requestedEnd)}
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

/**
 * Get a descriptive label for a score
 */
function getScoreDescription(score: number): string {
	if (score >= 90) return "Excellent";
	if (score >= 80) return "Very Good";
	if (score >= 70) return "Good";
	if (score >= 60) return "Fair";
	if (score >= 40) return "Poor";
	if (score >= 20) return "Very Poor";
	return "Critical";
}

/**
 * Generate an AI-powered summary for the pond analysis
 */
export async function generateAiSummary(
	result: PondScoreResult,
): Promise<string> {
	try {
		const apiKey = ENV.MISTRAL_API_KEY;
		if (!apiKey) {
			return generateFallbackSummary(result);
		}

		const context = formatAnalysisContext(result);

		const { text } = await generateText({
			model: mistral("ministral-3b-latest"),
			system: SYSTEM_PROMPT,
			prompt: `\n\n${context}\n\nPlease provide your professional analysis and advice for this pond.`,
			temperature: 0.4,
			maxOutputTokens: 400,
		});

		return text;
	} catch (error) {
		console.error("Error generating AI summary:", error);
		return generateFallbackSummary(result);
	}
}

/**
 * Generate a fallback summary when AI is not available
 */
function generateFallbackSummary(result: PondScoreResult): string {
	const { pondId, finalScore, parameterScores, metadata } = result;
	const { dataCoverage } = metadata.executionStats;

	const overallDescription = getScoreDescription(finalScore);

	// Find best and worst parameters
	const parameterCodes = Object.keys(parameterScores) as Array<
		keyof typeof parameterScores
	>;
	const scores = parameterCodes.map((code) => ({
		code,
		score: parameterScores[code],
		name: code.charAt(0).toUpperCase() + code.slice(1),
	}));

	const bestParams = scores.filter((s) => s.score >= 80);
	const concerningParams = scores.filter((s) => s.score < 60);

	let summary = `Pond ${pondId} Analysis: Water quality is ${overallDescription.toLowerCase()} with a score of ${finalScore.toFixed(0)}/100.`;

	if (bestParams.length > 0) {
		summary += ` ${bestParams.map((p) => p.name).join(", ")} ${bestParams.length > 1 ? "are" : "is"} performing well.`;
	}

	if (concerningParams.length > 0) {
		summary += ` Attention needed for ${concerningParams.map((p) => p.name).join(", ")} ${concerningParams.length > 1 ? "which are" : "which is"} below optimal levels.`;
	} else if (bestParams.length === 0) {
		summary += ` All parameters require attention to improve water quality.`;
	}

	if (dataCoverage.coveragePercentage < 70) {
		summary += ` Note: Data coverage is limited (${dataCoverage.coveragePercentage}%), consider increasing monitoring frequency.`;
	}

	summary += ` Continue regular monitoring to maintain optimal conditions for shrimp health.`;

	return summary;
}
