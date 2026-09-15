import { createAnalysisProfile } from "./analysis-profile.js";

const {
  measure: measure30d,
  options: options30d,
  setup: setup30d,
  warmup: warmup30d,
} = createAnalysisProfile({
  defaultEndDate: "2026-01-31T00:00:00.000Z",
  defaultStartDate: "2026-01-01T00:00:00.000Z",
  profileId: "analysis-30d",
  windowDays: 30,
});

export {
  measure30d as measure,
  options30d as options,
  setup30d as setup,
  warmup30d as warmup,
};
