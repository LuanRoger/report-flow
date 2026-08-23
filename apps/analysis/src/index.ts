import { bearer as bearerPlugin } from "@elysia/bearer";
import { cors } from "@elysia/cors";
import openapi from "@elysia/openapi";
import serverTiming from "@elysia/server-timing";
import { html } from "@elysiajs/html";
import { Elysia } from "elysia";
import logixlysia from "logixlysia";
import { ENV } from "varlock/env";
import z from "zod";
import { version } from "../package.json";
import { analysesModule } from "./modules/analysis";

const appName = "analysis";
const port = 3001;
const localUrl = `http://localhost:${port}`;

new Elysia()
  .use(
    logixlysia({
      config: {
        contextDepth: 2,
        ip: false,
        service: appName,
        showContextTree: true,
        showStartupMessage: true,
        slowThreshold: 50,
        startupMessageFormat: "simple",
        verySlowThreshold: 100,
      },
    })
  )
  .use(
    cors({
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    })
  )
  .use(serverTiming())
  .use(
    openapi({
      documentation: {
        components: {
          securitySchemes: {
            bearerAuth: {
              scheme: "bearer",
              type: "http",
            },
          },
        },
        info: {
          license: {
            name: "MIT",
          },
          title: appName,
          version,
        },
        openapi: "3.2.0",
        servers: [
          {
            description: "Local server",
            url: localUrl,
          },
        ],
      },
      mapJsonSchema: {
        zod: z.toJSONSchema,
      },
      scalar: {
        customCss: "",
        showOperationId: true,
        theme: "deepSpace",
      },
    })
  )
  .use(html())
  .use(bearerPlugin())
  .onBeforeHandle(({ set, status, bearer }) => {
    const apiKey = ENV.API_KEY;

    if (bearer !== apiKey) {
      set.status = 401;
      return status("Unauthorized");
    }
  })
  .use(analysesModule)
  .listen(port);
