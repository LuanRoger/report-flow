import html from "@elysiajs/html";
import Elysia from "elysia";
import z from "zod";
import {
  analysisBodySchema,
  analysisGenerationOptionsSchema,
  getAnalysisById200ResponseSchema,
  idParamSchema,
  performAnalysisByCycle200ResponseSchema,
  performAnalysisByPond200ResponseSchema,
} from "./schemas";
import {
  deleteAnalysisById,
  generateReportForAnalysis,
  getAnalysisById,
  performAnalysisByCycle,
  performAnalysisByPond,
  storeAnalysisScoreResult,
} from "./use-cases";
import { createAnalysisExecutionTimer } from "./utils/execution-timing";

export const analysesReportModule = new Elysia({ prefix: "/report" })
  .use(html())
  .get(
    "/:id",
    async ({ params: { id } }) => {
      const report = await generateReportForAnalysis(id);
      return report;
    },
    {
      detail: {
        description:
          "Generate a report for the given analysis ID in HTML format",
        operationId: "getAnalysisReport",
      },
      params: idParamSchema,
      response: {
        200: z.string(),
        500: z.string(),
      },
    }
  );

export const analysesModule = new Elysia({ prefix: "/analyses" })
  .use(analysesReportModule)
  .get(
    "/:id",
    async ({ status, params: { id } }) => {
      const result = await getAnalysisById(id);
      const response = getAnalysisById200ResponseSchema.parse(result);
      return status("OK", response);
    },
    {
      detail: {
        description: "Get an analysis by its ID",
        operationId: "getAnalysisById",
      },
      params: idParamSchema,
      response: {
        200: getAnalysisById200ResponseSchema,
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .post(
    "/ponds/:id",
    async ({ body, params: { id }, status }) => {
      const executionTimer = createAnalysisExecutionTimer(body);
      const result = await performAnalysisByPond(id, body, executionTimer);
      await storeAnalysisScoreResult(result, undefined, {
        executionTimer,
        generateEmbedding: body.generateEmbedding,
      });

      return status("OK", {
        ...result,
        executionTimings: executionTimer.finish(),
      });
    },
    {
      body: analysisBodySchema,
      detail: {
        description:
          "Perform pond analysis with configurable continuity-gap and artifact generation options",
        operationId: "performAnalysisByPond",
      },
      params: idParamSchema,
      response: {
        200: performAnalysisByPond200ResponseSchema,
        400: z.string(),
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .post(
    "/cycles/:id",
    async ({ body, params: { id }, status }) => {
      const options = body ?? analysisGenerationOptionsSchema.parse({});
      const executionTimer = createAnalysisExecutionTimer(options);
      const result = await performAnalysisByCycle(id, options, executionTimer);
      await storeAnalysisScoreResult(result, id, {
        executionTimer,
        generateEmbedding: options.generateEmbedding,
      });

      return status("OK", {
        ...result,
        executionTimings: executionTimer.finish(),
      });
    },
    {
      body: z.optional(analysisGenerationOptionsSchema),
      detail: {
        description:
          "Perform cycle analysis with configurable continuity-gap and artifact generation options",
        operationId: "performAnalysisByCycle",
      },
      params: idParamSchema,
      response: {
        200: performAnalysisByCycle200ResponseSchema,
        400: z.string(),
        404: z.string(),
        500: z.string(),
      },
    }
  )
  .delete(
    "/:id",
    async ({ set, params: { id } }) => {
      await deleteAnalysisById(id);
      set.status = "No Content";
    },
    {
      detail: {
        description: "Delete an analysis by its ID",
        operationId: "deleteAnalysisById",
      },
      params: idParamSchema,
      response: {
        204: z.string(),
        404: z.string(),
        500: z.string(),
      },
    }
  );
