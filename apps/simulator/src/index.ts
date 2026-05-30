type Scenario = "ideal" | "normal" | "alerta" | "critico" | "misto";
type Mode = "constant" | "precalc";

const PARAMS = [
	"temperature",
	"ph",
	"salinity",
	"turbidity",
	"dissolved_oxygen",
] as const;

type ParamCode = (typeof PARAMS)[number];

interface Payload {
	farmId: string;
	pondId: string;
	cycleId: string;
	recordedAt: string;
	parameterCode: ParamCode;
	value: number;
	unit: string;
	source: string;
}

const DEFAULTS = {
	farmId: "FAZ001",
	pondId: "V01",
	cycleId: "C2026-01",
	source: "simulator",
};

const UNITS: Record<ParamCode, string> = {
	temperature: "°C",
	ph: "",
	salinity: "ppt",
	turbidity: "NTU",
	dissolved_oxygen: "mg/L",
};

const RANGES: Record<
	Scenario | "ideal" | "normal" | "alerta" | "critico",
	Record<ParamCode, [number, number]>
> = {
	ideal: {
		temperature: [27, 30],
		ph: [7.5, 8.3],
		salinity: [15, 25],
		turbidity: [5, 20],
		dissolved_oxygen: [6, 9],
	},
	normal: {
		temperature: [26, 31],
		ph: [7.2, 8.6],
		salinity: [10, 30],
		turbidity: [10, 40],
		dissolved_oxygen: [5, 7],
	},
	alerta: {
		temperature: [24, 33],
		ph: [6.8, 9.0],
		salinity: [5, 35],
		turbidity: [30, 80],
		dissolved_oxygen: [3.5, 5],
	},
	critico: {
		temperature: [20, 36],
		ph: [6.2, 9.5],
		salinity: [0, 40],
		turbidity: [60, 200],
		dissolved_oxygen: [1, 3.5],
	},
	misto: {} as Record<ParamCode, [number, number]>,
};

function pickScenario(s: Scenario): Scenario {
	const scenario: Scenario = s;
	if (scenario !== "misto") {
		return scenario;
	}

	const options: Scenario[] = ["ideal", "normal", "alerta", "critico"];
	const randomIndex = Math.floor(Math.random() * options.length);
	const randomScenario = options[randomIndex];
	if (!randomScenario) {
		throw new Error("Cenario não encontrado.");
	}

	return randomScenario;
}

function rand(min: number, max: number): number {
	return +(Math.random() * (max - min) + min).toFixed(3);
}

function buildPayload(
	param: ParamCode,
	recordedAt: Date,
	scenario: Scenario,
): Payload {
	const sc = pickScenario(scenario);
	const [min, max] = RANGES[sc][param];
	return {
		farmId: DEFAULTS.farmId,
		pondId: DEFAULTS.pondId,
		cycleId: DEFAULTS.cycleId,
		recordedAt: recordedAt.toISOString(),
		parameterCode: param,
		value: rand(min, max),
		unit: UNITS[param],
		source: DEFAULTS.source,
	};
}

async function send(payload: Payload, enableLogs: boolean) {
	const url = process.env.INGEST_URL;
	if (!url) throw new Error("INGEST_URL não definido.");

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (enableLogs) {
		console.log("Enviando:", payload);
	}

	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
	});

	if (!res.ok) {
		const txt = await res.text().catch(() => "");
		console.error("Falha ao enviar:", res.status, txt);
	}
}

function parseArgs(): {
	scenario: Scenario;
	mode: Mode;
	rate: number;
	from: string | undefined;
	to: string | undefined;
	stepMinutes: number;
	enableLogs: boolean;
} {
	const args = process.argv.slice(2);
	const get = (key: string) => {
		const i = args.indexOf(`--${key}`);
		return i >= 0 ? args[i + 1] : undefined;
	};

	const scenario = (get("scenario") ?? "normal") as Scenario;
	const mode = (get("mode") ?? "constant") as Mode;
	const rate = Number(get("rate") ?? "60"); // registros por minuto
	const from = get("from");
	const to = get("to");
	const stepMinutes = Number(get("step-minutes") ?? "30");
	const enableLogs = get("enable-logs")?.toLowerCase() === "true";

	return { scenario, mode, rate, from, to, stepMinutes, enableLogs };
}

async function runConstant(
	scenario: Scenario,
	rate: number,
	enableLogs: boolean,
) {
	const intervalMs = Math.floor(60000 / rate);
	if (enableLogs) {
		console.log(`Modo constante: ${rate}/min, intervalo ${intervalMs}ms`);
	}

	while (true) {
		const param = PARAMS[Math.floor(Math.random() * PARAMS.length)];
		if (!param) {
			continue;
		}

		const payload = buildPayload(param, new Date(), scenario);
		await send(payload, enableLogs);
		await new Promise((r) => setTimeout(r, intervalMs));
	}
}

async function runPrecalc(
	scenario: Scenario,
	fromIso: string,
	toIso: string,
	stepMinutes: number,
	enableLogs: boolean,
) {
	const start = new Date(fromIso);
	const end = new Date(toIso);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		throw new Error("Datas inválidas para --from e --to");
	}

	if (enableLogs) {
		console.log(
			`Modo pre-calculado: ${start.toISOString()} -> ${end.toISOString()} | step ${stepMinutes} min`,
		);
	}

	for (let t = start.getTime(); t <= end.getTime(); t += stepMinutes * 60000) {
		for (const param of PARAMS) {
			const payload = buildPayload(param, new Date(t), scenario);
			await send(payload, enableLogs);
		}
	}
}

(async () => {
	const { scenario, mode, rate, from, to, stepMinutes, enableLogs } =
		parseArgs();

	if (mode === "constant") {
		await runConstant(scenario, rate, enableLogs);
	} else {
		if (!from || !to) {
			throw new Error("No modo precalc, informe --from e --to");
		}
		await runPrecalc(scenario, from, to, stepMinutes, enableLogs);
	}
})();
