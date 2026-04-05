export interface SettingItem {
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

export interface SettingsUpsertInput {
  key: string;
  value: string;
  description?: string;
}

export interface UsageEventInput {
  workspaceId: string;
  assetType: string;
  assetId: string;
  version: string;
  eventType: string;
  success: boolean;
  context?: Record<string, string>;
}

export interface MetricsOverviewItem {
  assetType: string;
  triggerCount: number;
  successCount: number;
  successRate: number;
  recentTs: string | null;
}

export interface MetricsRatingItem {
  assetType: string;
  avgScore: number;
  ratingCount: number;
}

export interface MetricsOverview {
  windowDays: number;
  metrics: MetricsOverviewItem[];
  ratings: MetricsRatingItem[];
}

export interface MetricsByAssetInput {
  workspaceId: string;
  assetType: string;
  assetId: string;
  days?: number;
}

export interface MetricsByAsset {
  triggerCount: number;
  successCount: number;
  successRate: number;
  recentTs: string | null;
  avgScore: number;
  ratingCount: number;
}

export interface RatingInput {
  workspaceId: string;
  assetType: string;
  assetId: string;
  version: string;
  score: number;
  comment?: string;
}

export interface MetricsIdResult {
  eventId?: string;
  ratingId?: string;
}
