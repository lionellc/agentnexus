import type {
  MetricsByAsset,
  MetricsByAssetInput,
  MetricsIdResult,
  MetricsOverview,
  RatingInput,
  RuntimeFlags,
  RuntimeFlagsInput,
  UsageEventInput,
} from "../types";

import { invokeCommand } from "./tauriClient";

export const settingsService = {
  runtimeFlagsGet(): Promise<RuntimeFlags> {
    return invokeCommand("runtime_flags_get");
  },

  runtimeFlagsUpdate(input: RuntimeFlagsInput): Promise<RuntimeFlags> {
    return invokeCommand("runtime_flags_update", { input });
  },

  ingestUsageEvent(input: UsageEventInput): Promise<MetricsIdResult> {
    return invokeCommand("metrics_ingest_usage_event", { input });
  },

  metricsOverview(workspaceId: string, days?: number): Promise<MetricsOverview> {
    return invokeCommand("metrics_query_overview", { workspaceId, days });
  },

  metricsByAsset(input: MetricsByAssetInput): Promise<MetricsByAsset> {
    return invokeCommand("metrics_query_by_asset", { input });
  },

  submitRating(input: RatingInput): Promise<MetricsIdResult> {
    return invokeCommand("metrics_submit_rating", { input });
  },
};
