type Scenario = "ideal" | "normal" | "alerta" | "critico" | "misto";
type Mode = "constant" | "precalc";

const PARAMS = [
	"temperature",
	"ph",
	"salinity",
	"turbidity",
	"suspended_solids",
	"dissolved_oxygen",
	"ammonia",
	"nitrite",
] as const;

type ParamCode = (typeof PARAMS)[number];

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
	suspended_solids: "mg/L",
	dissolved_oxygen: "mg/L",
	ammonia: "mg/L",
	nitrite: "mg/L",
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
		suspended_solids: [10, 30],
		dissolved_oxygen: [6, 9],
		ammonia: [0.0, 0.2],
		nitrite: [0.0, 0.1],
	},
	normal: {
		temperature: [26, 31],
		ph: [7.2, 8.6],
		salinity: [10, 30],
		turbidity: [10, 40],
		suspended_solids: [20, 60],
		dissolved_oxygen: [5, 7],
		ammonia: [0.1, 0.5],
		nitrite: [0.05, 0.2],
	},
	alerta: {
		temperature: [24, 33],
		ph: [6.8, 9.0],
		salinity: [5, 35],
		turbidity: [30, 80],
		suspended_solids: [50, 120],
		dissolved_oxygen: [3.5, 5],
		ammonia: [0.5, 1.5],
		nitrite: [0.2, 0.6],
	},
	critico: {
		temperature: [20, 36],
		ph: [6.2, 9.5],
		salinity: [0, 40],
		turbidity: [60, 200],
		suspended_solids: [100, 300],
		dissolved_oxygen: [1, 3.5],
		ammonia: [1.5, 5],
		nitrite: [0.6, 2],
	},
	misto: {} as any, // resolvido dinamicamente
};

function pickScenario(s: Scenario): Scenario {
	if (s !== "misto") return s;
	const options: Scenario[] = ["ideal", "normal", "alerta", "critico"];
	return options[Math.floor(Math.random() * options.length)];
}

function rand(min: number, max: number) {
	return +(Math.random() * (max - min) + min).toFixed(3);
}

function buildPayload(param: ParamCode, recordedAt: Date, scenario: Scenario) {
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

async function send(payload: any) {
	const url = process.env.INGEST_URL;
	if (!url) throw new Error("INGEST_URL não definido.");

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	console.log("Enviando:", payload);

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

function parseArgs() {
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

	return { scenario, mode, rate, from, to, stepMinutes };
}

async function runConstant(scenario: Scenario, rate: number) {
	const intervalMs = Math.floor(60000 / rate);
	console.log(`Modo constante: ${rate}/min, intervalo ${intervalMs}ms`);

	while (true) {
		const param = PARAMS[Math.floor(Math.random() * PARAMS.length)];
		const payload = buildPayload(param, new Date(), scenario);
		await send(payload);
		await new Promise((r) => setTimeout(r, intervalMs));
	}
}

async function runPrecalc(
	scenario: Scenario,
	fromIso: string,
	toIso: string,
	stepMinutes: number,
) {
	const start = new Date(fromIso);
	const end = new Date(toIso);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		throw new Error("Datas inválidas para --from e --to");
	}

	console.log(
		`Modo pre-calculado: ${start.toISOString()} -> ${end.toISOString()} | step ${stepMinutes} min`,
	);

	for (let t = start.getTime(); t <= end.getTime(); t += stepMinutes * 60000) {
		for (const param of PARAMS) {
			const payload = buildPayload(param, new Date(t), scenario);
			await send(payload);
		}
	}
}

(async () => {
	const { scenario, mode, rate, from, to, stepMinutes } = parseArgs();

	if (mode === "constant") {
		await runConstant(scenario, rate);
	} else {
		if (!from || !to) {
			throw new Error("No modo precalc, informe --from e --to");
		}
		await runPrecalc(scenario, from, to, stepMinutes);
	}
})();
