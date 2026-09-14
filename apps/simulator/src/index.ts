type Scenario = "ideal" | "normal" | "alerta" | "critico" | "misto";
type Mode = "constant" | "precalc";

const PARAMS = ["temperature", "ph", "salinity", "dissolvedOxygen"] as const;

type ParamCode = (typeof PARAMS)[number];

interface Payload {
  cycleId: number;
  parameterCode: ParamCode;
  pondId: number;
  recordedAt: string;
  sourceType: string;
  unit: string;
  value: number;
}

let DEFAULTS = {
  cycleId: 1,
  pondId: 1,
  sourceType: "simulator",
};

function setDefaults(pondId: number, cycleId: number) {
  DEFAULTS = {
    cycleId,
    pondId,
    sourceType: "simulator",
  };
}

const UNITS: Record<ParamCode, string> = {
  dissolvedOxygen: "mg/L",
  ph: "pH",
  salinity: "ppt",
  temperature: "°C",
};

const RANGES: Record<
  Scenario | "ideal" | "normal" | "alerta" | "critico",
  Record<ParamCode, [number, number]>
> = {
  alerta: {
    dissolvedOxygen: [3.5, 4.5],
    ph: [6.8, 9.0],
    salinity: [5, 35],
    temperature: [24, 33],
  },
  critico: {
    dissolvedOxygen: [1, 3],
    ph: [6.2, 9.5],
    salinity: [0, 40],
    temperature: [20, 36],
  },
  ideal: {
    dissolvedOxygen: [4.8, 5.2],
    ph: [7.5, 8.3],
    salinity: [15, 25],
    temperature: [27, 30],
  },
  misto: {} as Record<ParamCode, [number, number]>,
  normal: {
    dissolvedOxygen: [4.5, 5.5],
    ph: [7.2, 8.6],
    salinity: [10, 30],
    temperature: [26, 31],
  },
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
  scenario: Scenario
): Payload {
  const sc = pickScenario(scenario);
  const [min, max] = RANGES[sc][param];
  return {
    cycleId: DEFAULTS.cycleId,
    parameterCode: param,
    pondId: DEFAULTS.pondId,
    recordedAt: recordedAt.toISOString(),
    sourceType: DEFAULTS.sourceType,
    unit: UNITS[param],
    value: rand(min, max),
  };
}

async function send(payload: Payload, enableLogs: boolean) {
  const url = process.env.INGEST_URL;
  if (!url) {
    throw new Error("INGEST_URL não definido.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.INGEST_API_KEY}`,
    "Content-Type": "application/json",
  };

  if (enableLogs) {
    console.log("Enviando:", payload);
  }

  const res = await fetch(url, {
    body: JSON.stringify(payload),
    headers,
    method: "POST",
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
  stepSeconds: number;
  enableLogs: boolean;
  pondId: number;
  cycleId: number;
} {
  const args = process.argv.slice(2);
  const get = (key: string) => {
    const i = args.indexOf(`--${key}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const scenario = (get("scenario") ?? "normal") as Scenario;
  const mode = (get("mode") ?? "constant") as Mode;
  const rate = Number(get("rate") ?? "24");
  const from = get("from");
  const to = get("to");
  const stepSecondsArgument = get("step-seconds");
  const stepMinutesArgument = get("step-minutes");
  const stepSeconds = Number(
    stepSecondsArgument ??
      (stepMinutesArgument ? Number(stepMinutesArgument) * 60 : 10)
  );
  const enableLogs = get("enable-logs")?.toLowerCase() === "true";
  const pondId = Number(get("pond-id") ?? "1");
  const cycleId = Number(get("cycle-id") ?? "1");

  return {
    cycleId,
    enableLogs,
    from,
    mode,
    pondId,
    rate,
    scenario,
    stepSeconds,
    to,
  };
}

async function runConstant(
  scenario: Scenario,
  rate: number,
  enableLogs: boolean
) {
  if (!(Number.isFinite(rate) && rate > 0)) {
    throw new Error("A taxa deve ser maior que zero.");
  }

  const intervalMs = Math.max(1, Math.floor((60_000 * PARAMS.length) / rate));
  if (enableLogs) {
    console.log(
      `Modo constante: ${rate} registros/min, intervalo de coleta ${intervalMs}ms`
    );
  }

  // biome-ignore lint/suspicious/noUnnecessaryConditions: Necessary in an infinite loop
  while (true) {
    const recordedAt = new Date();
    for (const param of PARAMS) {
      const payload = buildPayload(param, recordedAt, scenario);
      // biome-ignore lint/performance/noAwaitInLoops: Requests intentionally preserve collection order
      await send(payload, enableLogs);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function runPrecalc(
  scenario: Scenario,
  fromIso: string,
  toIso: string,
  stepSeconds: number,
  enableLogs: boolean
) {
  const start = new Date(fromIso);
  const end = new Date(toIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Datas inválidas para --from e --to");
  }
  if (start.getTime() >= end.getTime()) {
    throw new Error("A data inicial deve ser anterior à data final.");
  }
  if (!(Number.isFinite(stepSeconds) && stepSeconds > 0)) {
    throw new Error("O intervalo de coleta deve ser maior que zero.");
  }

  if (enableLogs) {
    console.log(
      `Modo pre-calculado: ${start.toISOString()} -> ${end.toISOString()} | intervalo ${stepSeconds} s`
    );
  }

  for (let t = start.getTime(); t < end.getTime(); t += stepSeconds * 1000) {
    const recordedAt = new Date(t);
    for (const param of PARAMS) {
      const payload = buildPayload(param, recordedAt, scenario);

      // biome-ignore lint/performance/noAwaitInLoops: Will send requests sequentially after a timer. This operation is not to be made concurrently
      await send(payload, enableLogs);
    }
  }
}

(async () => {
  const {
    scenario,
    mode,
    rate,
    from,
    to,
    stepSeconds,
    enableLogs,
    pondId,
    cycleId,
  } = parseArgs();

  setDefaults(pondId, cycleId);

  if (enableLogs) {
    console.log(`Using pondId: ${pondId}, cycleId: ${cycleId}`);
  }

  if (mode === "constant") {
    await runConstant(scenario, rate, enableLogs);
  } else {
    if (!(from && to)) {
      throw new Error("No modo precalc, informe --from e --to");
    }
    await runPrecalc(scenario, from, to, stepSeconds, enableLogs);
  }
})();
