import { createAnalysisProfile } from "./analysis-profile.js";

const {
  measure: measure7d,
  options: options7d,
  setup: setup7d,
  warmup: warmup7d,
} = createAnalysisProfile({
  defaultEndDate: "2026-01-08T00:00:00.000Z",
  defaultStartDate: "2026-01-01T00:00:00.000Z",
  profileId: "analysis-7d",
  windowDays: 7,
});

export {
  measure7d as measure,
  options7d as options,
  setup7d as setup,
  warmup7d as warmup,
};
