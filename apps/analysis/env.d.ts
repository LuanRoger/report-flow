/// <reference types="bun-types" />

declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
  }
}
