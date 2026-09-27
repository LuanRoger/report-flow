import { describe, expect, test } from "bun:test";
import { buildAdvisorSystemPrompt } from "./prompt";
import type { AdvisorSource } from "./source-context";

const createSource = (sourceKey: string, context: string): AdvisorSource => ({
  analysisCreatedAt: new Date("2026-01-03T00:00:00.000Z"),
  analysisId: 42,
  context,
  cycleId: 7,
  periodEnd: new Date("2026-01-02T00:00:00.000Z"),
  periodStart: new Date("2026-01-01T00:00:00.000Z"),
  rank: 1,
  similarity: 0.9,
  sourceKey,
});

describe("Advisor system prompt", () => {
  test("constrains citations to the emitted source labels", () => {
    const prompt = buildAdvisorSystemPrompt([
      createSource("S1", "[S1]\nFirst context"),
      createSource("S2", "[S2]\nSecond context"),
    ]);

    expect(prompt).toContain("Rótulos permitidos nesta resposta: S1, S2.");
    expect(prompt).toContain("formato exato [S1]");
    expect(prompt).toContain("Nunca use nomes de cenários");
    expect(prompt).toContain("[S1]\nFirst context");
    expect(prompt).toContain("[S2]\nSecond context");
  });

  test("requires one language and complete comparison answers", () => {
    const prompt = buildAdvisorSystemPrompt([
      createSource("S1", "[S1]\nContext"),
    ]);

    expect(prompt).toContain(
      "Responda integralmente no idioma predominante da mensagem mais recente"
    );
    expect(prompt).toContain("Não misture idiomas");
    expect(prompt).toContain(
      "informe os valores de todos os períodos solicitados, a diferença pedida e a ordenação explícita"
    );
    expect(prompt).toContain(
      "Não declare insuficiência quando o conjunto das fontes contiver todos os fatos necessários"
    );
  });

  test("states that no citation labels are available without sources", () => {
    const prompt = buildAdvisorSystemPrompt([]);

    expect(prompt).toContain("Rótulos permitidos nesta resposta: nenhum.");
    expect(prompt).toContain(
      "Nenhuma análise relevante foi recuperada para esta pergunta."
    );
  });
});
