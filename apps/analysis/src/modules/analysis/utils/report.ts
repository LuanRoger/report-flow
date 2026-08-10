import type { AnalysisResult } from "database";

export interface ReportOptions {
	aiSummary?: string;
}

/**
 * Parameter display names for the report
 */
const PARAMETER_DISPLAY_NAMES: Record<string, string> = {
	dissolvedOxygen: "Dissolved Oxygen",
	ph: "pH",
	salinity: "Salinity",
	temperature: "Temperature",
	turbidity: "Turbidity",
};

/**
 * Parameter units for the report
 */
const PARAMETER_UNITS: Record<string, string> = {
	dissolvedOxygen: "mg/L",
	ph: "",
	salinity: "ppt",
	temperature: "°C",
	turbidity: "NTU",
};

/**
 * Get score color based on the score value
 */
function getScoreColor(score: number): string {
	if (score >= 80) {
		return "#22c55e"; // Green - Excellent
	}
	if (score >= 60) {
		return "#84cc16"; // Light Green - Good
	}
	if (score >= 40) {
		return "#eab308"; // Yellow - Fair
	}
	if (score >= 20) {
		return "#f97316"; // Orange - Poor
	}
	return "#ef4444"; // Red - Critical
}

/**
 * Get coverage color based on the coverage percentage
 */
function getCoverageColor(coveragePercentage: number): string {
	if (coveragePercentage >= 90) {
		return "#22c55e";
	}
	if (coveragePercentage >= 70) {
		return "#84cc16";
	}
	if (coveragePercentage >= 50) {
		return "#eab308";
	}
	return "#ef4444";
}

/**
 * Format date for display
 */
function formatDate(date: Date | null): string {
	if (!date) {
		return "N/A";
	}
	return date.toLocaleDateString("en-US", {
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		month: "long",
		year: "numeric",
	});
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/**
 * Format a number with 2 decimal places
 */
function formatNumber(value: number | null): string {
	if (value === null) {
		return "N/A";
	}
	return value.toFixed(2);
}

/**
 * Generate a progress bar HTML for a score
 */
function generateProgressBar(score: number, max = 100): string {
	const percentage = (score / max) * 100;
	const color = getScoreColor(score);
	return `
		<div class="progress-bar" style="width: 100%; height: 20px; background-color: #e5e7eb; border-radius: 10px; overflow: hidden;">
			<div style="width: ${percentage}%; height: 100%; background-color: ${color}; border-radius: 10px; transition: width 0.3s ease;"></div>
		</div>
	`;
}

/**
 * Generate parameter stats table rows
 */
function generateParameterStatsRows(result: AnalysisResult): string {
	const metadataContent =
		typeof result.metadata === "string"
			? JSON.parse(result.metadata)
			: result.metadata;
	const { parameterStats } = metadataContent;
	const parameterCodes = Object.keys(parameterStats);

	let rows = "";

	for (const paramCode of parameterCodes) {
		const stats = parameterStats[paramCode];
		const displayName = PARAMETER_DISPLAY_NAMES[paramCode] || paramCode;
		const unit = PARAMETER_UNITS[paramCode] || "";

		rows += `
		<tr>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-weight: 600;">${displayName}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${formatNumber(stats.rawValues.min)}${unit}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${formatNumber(stats.rawValues.max)}${unit}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${formatNumber(stats.rawValues.mean)}${unit}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${stats.rawValues.count}</td>
		</tr>
		`;
	}

	return rows;
}

/**
 * Generate parameter scores table rows
 */
function generateParameterScoresRows(result: AnalysisResult): string {
	const parameterScores = {
		dissolvedOxygen: result.dissolvedOxygenScore,
		ph: result.phScore,
		salinity: result.salinityScore,
		temperature: result.temperatureScore,
		turbidity: result.turbidityScore,
	};
	const parameterCodes = Object.keys(parameterScores);

	let rows = "";

	for (const paramCode of parameterCodes) {
		const score = parameterScores[paramCode as keyof typeof parameterScores];
		const displayName = PARAMETER_DISPLAY_NAMES[paramCode] || paramCode;
		const color = getScoreColor(score);

		rows += `
		<tr>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-weight: 600;">${displayName}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
				<span style="color: ${color}; font-weight: 700; font-size: 1.1em;">${score.toFixed(1)}</span>/100
			</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left;">
				${generateProgressBar(score)}
			</td>
		</tr>
		`;
	}

	return rows;
}

/**
 * Generate temporal metrics table rows
 */
function generateTemporalMetricsRows(result: AnalysisResult): string {
	const metadataContent =
		typeof result.metadata === "string"
			? JSON.parse(result.metadata)
			: result.metadata;
	const { parameterStats } = metadataContent;
	const parameterCodes = Object.keys(parameterStats);

	let rows = "";

	for (const paramCode of parameterCodes) {
		const stats = parameterStats[paramCode];
		const displayName = PARAMETER_DISPLAY_NAMES[paramCode] || paramCode;
		const temporal = stats.temporalMetrics;

		rows += `
		<tr>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-weight: 600;">${displayName}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${formatNumber(temporal.meanScore)}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${formatNumber(temporal.minScore)}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${(temporal.criticalTimeRatio * 100).toFixed(1)}%</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${temporal.criticalCount}</td>
		</tr>
		`;
	}

	return rows;
}

/**
 * Generate measurements by parameter table rows
 */
function generateMeasurementsByParameterRows(result: AnalysisResult): string {
	const metadataContent =
		typeof result.metadata === "string"
			? JSON.parse(result.metadata)
			: result.metadata;
	const { measurementsByParameter } = metadataContent.executionStats;
	const parameterCodes = Object.keys(measurementsByParameter);

	let rows = "";

	for (const paramCode of parameterCodes) {
		const count = measurementsByParameter[paramCode];
		const displayName = PARAMETER_DISPLAY_NAMES[paramCode] || paramCode;

		rows += `
		<tr>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-weight: 600;">${displayName}</td>
			<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${count}</td>
		</tr>
		`;
	}

	return rows;
}

/**
 * Generate the complete HTML report
 */
export function generateHtmlReport(
	result: AnalysisResult,
	options: ReportOptions = {}
): string {
	const { pondId, finalScore, metadata, startTime, endTime } = result;
	const metadataContent =
		typeof metadata === "string" ? JSON.parse(metadata) : metadata;
	const {
		executionStats,
		criticalThreshold,
		aggregationWeights,
		parameterWeights,
	} = metadataContent;
	const { totalMeasurements, dataCoverage, timeRange } = executionStats;
	const { aiSummary } = options;

	const finalScoreColor = getScoreColor(finalScore);
	const coverageColor = getCoverageColor(dataCoverage.coveragePercentage);

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Pond Analysis Report - ${pondId}</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			padding: 20px;
		}

		.container {
			max-width: 1200px;
			margin: 0 auto;
		}

		.header {
			text-align: center;
			color: white;
			margin-bottom: 30px;
		}

		.header h1 {
			font-size: 2.5em;
			margin-bottom: 10px;
			text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
		}

		.header .subtitle {
			font-size: 1.2em;
			opacity: 0.9;
		}

		.report-card {
			background: white;
			border-radius: 16px;
			box-shadow: 0 20px 40px rgba(0,0,0,0.1);
			padding: 30px;
			margin-bottom: 20px;
		}

		.report-header {
			border-bottom: 3px solid #667eea;
			padding-bottom: 20px;
			margin-bottom: 25px;
			display: flex;
			justify-content: space-between;
			align-items: center;
			flex-wrap: wrap;
			gap: 15px;
		}

		.report-header h2 {
			color: #1f2937;
			font-size: 1.8em;
		}

		.download-btn {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			padding: 12px 24px;
			border: none;
			border-radius: 8px;
			cursor: pointer;
			font-size: 1em;
			font-weight: 600;
			transition: transform 0.2s ease, box-shadow 0.2s ease;
		}

		.download-btn:hover {
			transform: translateY(-2px);
			box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
		}

		.download-btn:active {
			transform: translateY(0);
		}

		.summary-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
			gap: 20px;
			margin-bottom: 30px;
		}

		.summary-card {
			background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
			border-radius: 12px;
			padding: 20px;
			text-align: center;
		}

		.summary-card .label {
			color: #6b7280;
			font-size: 0.9em;
			margin-bottom: 8px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.summary-card .value {
			color: #1f2937;
			font-size: 2em;
			font-weight: 700;
		}

		.final-score-card {
			background: linear-gradient(135deg, ${finalScoreColor}22 0%, ${finalScoreColor}44 100%);
			border: 3px solid ${finalScoreColor};
		}

		.final-score-card .value {
			color: ${finalScoreColor};
			font-size: 3em;
		}

		.section {
			margin-bottom: 30px;
		}

		.section h3 {
			color: #1f2937;
			font-size: 1.4em;
			margin-bottom: 15px;
			padding-bottom: 10px;
			border-bottom: 2px solid #e5e7eb;
		}

		.table-container {
			overflow-x: auto;
		}

		.table {
			width: 100%;
			border-collapse: collapse;
			background: white;
			border-radius: 8px;
			overflow: hidden;
			box-shadow: 0 1px 3px rgba(0,0,0,0.1);
		}

		.table th {
			padding: 15px;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			text-align: left;
			font-weight: 600;
			text-transform: uppercase;
			font-size: 0.85em;
			letter-spacing: 0.5px;
		}

		.table td {
			padding: 12px;
			border-bottom: 1px solid #e5e7eb;
		}

		.table tr:last-child td {
			border-bottom: none;
		}

		.table tr:hover {
			background: #f9fafb;
		}

		.status-badge {
			display: inline-block;
			padding: 6px 12px;
			border-radius: 20px;
			font-size: 0.85em;
			font-weight: 600;
		}

		.status-excellent {
			background: #22c55e;
			color: white;
		}

		.status-good {
			background: #84cc16;
			color: white;
		}

		.status-fair {
			background: #eab308;
			color: white;
		}

		.status-poor {
			background: #f97316;
			color: white;
		}

		.status-critical {
			background: #ef4444;
			color: white;
		}

		.info-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
			gap: 20px;
		}

		.info-card {
			background: #f9fafb;
			border-radius: 8px;
			padding: 15px;
			border-left: 4px solid #667eea;
		}

		.info-card .title {
			color: #667eea;
			font-weight: 600;
			margin-bottom: 8px;
			font-size: 0.9em;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.info-card .content {
			color: #4b5563;
			line-height: 1.6;
		}

		.footer {
			text-align: center;
			color: #9ca3af;
			font-size: 0.9em;
			margin-top: 30px;
			padding-top: 20px;
			border-top: 1px solid #e5e7eb;
		}

		/* AI Summary Card Styles */
		.ai-summary-card {
			background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
			border-radius: 12px;
			padding: 20px;
			margin-top: 20px;
			color: white;
			border: 1px solid #334155;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		}

		.ai-summary-header {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 15px;
			padding-bottom: 10px;
			border-bottom: 1px solid #334155;
		}

		.ai-icon {
			font-size: 1.5em;
		}

		.ai-label {
			font-weight: 600;
			font-size: 1.1em;
			color: #94a3b8;
		}

		.ai-summary-content {
			line-height: 1.7;
			font-size: 1em;
			color: #e2e8f0;
			white-space: pre-wrap;
		}

		.ai-summary-content p {
			margin: 0;
		}

		.ai-summary-content p + p {
			margin-top: 10px;
		}

		@media (max-width: 768px) {
			.summary-grid {
				grid-template-columns: 1fr;
			}

			.report-header {
				flex-direction: column;
				align-items: flex-start;
			}

			.table th, .table td {
				padding: 10px 8px;
				font-size: 0.9em;
			}
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>📊 Pond Analysis Report</h1>
			<p class="subtitle">Comprehensive Water Quality Analysis for Pond ${pondId}</p>
		</div>

		<div class="report-card">
			<div class="report-header">
				<h2>Analysis Report: ${pondId}</h2>
				<button class="download-btn" onclick="window.print()">📥 Download Report</button>
			</div>

			<!-- Summary Section -->
			<div class="section">
				<h3>📈 Overall Results</h3>
				<div class="summary-grid">
					<div class="summary-card final-score-card">
						<div class="label">Final Score</div>
						<div class="value">${finalScore.toFixed(1)}</div>
						<div style="margin-top: 10px;">${generateProgressBar(finalScore)}</div>
					</div>
					<div class="summary-card">
						<div class="label">Total Measurements</div>
						<div class="value">${totalMeasurements}</div>
					</div>
					<div class="summary-card">
						<div class="label">Data Coverage</div>
						<div class="value" style="color: ${coverageColor};">${dataCoverage.coveragePercentage}%</div>
					</div>
					<div class="summary-card">
						<div class="label">Parameters Monitored</div>
						<div class="value">${dataCoverage.presentParameters.length}</div>
					</div>
				</div>
				${
					aiSummary
						? `
				<div class="ai-summary-card">
					<div class="ai-summary-header">
						<span class="ai-icon">🤖</span>
						<span class="ai-label">Farm Advisor Summary</span>
					</div>
					<div class="ai-summary-content">${escapeHtml(aiSummary)}</div>
				</div>
				`
						: ""
				}
			</div>

			<!-- Time Range Section -->
			<div class="section">
				<h3>📅 Analysis Period</h3>
				<div class="info-grid">
					<div class="info-card">
						<div class="title">Analysis Period</div>
						<div class="content">
							${formatDate(startTime)} to ${formatDate(endTime)}
						</div>
					</div>
					<div class="info-card">
						<div class="title">Actual Data Range</div>
						<div class="content">
							${formatDate(timeRange.actualStart)} to ${formatDate(timeRange.actualEnd)}
						</div>
					</div>
				</div>
			</div>

			<!-- Parameter Scores Section -->
			<div class="section">
				<h3>🎯 Parameter Scores</h3>
				<div class="table-container">
					<table class="table">
						<thead>
							<tr>
								<th>Parameter</th>
								<th>Score</th>
								<th>Visual</th>
							</tr>
						</thead>
						<tbody>
							${generateParameterScoresRows(result)}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Parameter Statistics Section -->
			<div class="section">
				<h3>📊 Parameter Statistics</h3>
				<div class="table-container">
					<table class="table">
						<thead>
							<tr>
								<th>Parameter</th>
								<th>Min</th>
								<th>Max</th>
								<th>Mean</th>
								<th>Count</th>
							</tr>
						</thead>
						<tbody>
							${generateParameterStatsRows(result)}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Temporal Metrics Section -->
			<div class="section">
				<h3>⏱️ Temporal Metrics</h3>
				<div class="table-container">
					<table class="table">
						<thead>
							<tr>
								<th>Parameter</th>
								<th>Mean Score</th>
								<th>Min Score</th>
								<th>Critical Time %</th>
								<th>Critical Count</th>
							</tr>
						</thead>
						<tbody>
							${generateTemporalMetricsRows(result)}
						</tbody>
					</table>
				</div>
				<p style="margin-top: 10px; color: #6b7280; font-size: 0.9em;">
					<strong>Note:</strong> Critical threshold is set at ${criticalThreshold}. Scores below this indicate unfavorable conditions.
				</p>
			</div>

			<!-- Measurements Distribution Section -->
			<div class="section">
				<h3>📋 Measurements Distribution</h3>
				<div class="table-container">
					<table class="table">
						<thead>
							<tr>
								<th>Parameter</th>
								<th>Number of Measurements</th>
							</tr>
						</thead>
						<tbody>
							${generateMeasurementsByParameterRows(result)}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Configuration Section -->
			<div class="section">
				<h3>⚙️ Analysis Configuration</h3>
				<div class="info-grid">
					<div class="info-card">
						<div class="title">Aggregation Weights</div>
						<div class="content">
							<ul style="list-style: none; padding: 0;">
								<li><strong>Alpha (Mean):</strong> ${aggregationWeights.alpha}</li>
								<li><strong>Beta (Min):</strong> ${aggregationWeights.beta}</li>
								<li><strong>Gamma (Critical):</strong> ${aggregationWeights.gamma}</li>
							</ul>
						</div>
					</div>
					<div class="info-card">
						<div class="title">Parameter Weights</div>
						<div class="content">
							<ul style="list-style: none; padding: 0;">
								<li><strong>Temperature:</strong> ${parameterWeights.temperature}</li>
								<li><strong>pH:</strong> ${parameterWeights.ph}</li>
								<li><strong>Salinity:</strong> ${parameterWeights.salinity}</li>
								<li><strong>Dissolved Oxygen:</strong> ${parameterWeights.dissolvedOxygen}</li>
								<li><strong>Turbidity:</strong> ${parameterWeights.turbidity}</li>
							</ul>
						</div>
					</div>
				</div>
			</div>

			<div class="footer">
				<p>Generated on ${new Date().toLocaleString()} | Report Flow Analysis Service</p>
			</div>
		</div>
	</div>

	<script>
		// Add print styles for better PDF generation
		window.addEventListener('beforeprint', function() {
			const style = document.createElement('style');
			style.textContent = \`
				@media print {
					.download-btn {
						display: none !important;
					}
					body {
						background: white !important;
					}
					.report-card {
						box-shadow: none !important;
						border: 1px solid #ccc !important;
					}
				}
			\`;
			document.head.appendChild(style);
		});
	</script>
</body>
</html>
	`;
}
