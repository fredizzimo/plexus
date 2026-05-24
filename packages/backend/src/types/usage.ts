export interface UsageRecord {
  requestId: string;
  date: string; // ISO string
  sourceIp: string | null;
  apiKey: string | null;
  attribution: string | null;
  incomingApiType: string;
  provider: string | null;
  attemptCount: number;
  retryHistory?: string | null;
  incomingModelAlias: string | null;
  canonicalModelName: string | null;
  selectedModelName: string | null;
  finalAttemptProvider: string | null;
  finalAttemptModel: string | null;
  allAttemptedProviders: string | null;
  outgoingApiType: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  tokensReasoning: number | null;
  tokensCached: number | null;
  tokensCacheWrite?: number | null;
  costInput: number | null;
  costOutput: number | null;
  costCached: number | null;
  costCacheWrite?: number | null;
  costTotal: number | null;
  costSource: string | null;
  costMetadata: string | null;
  startTime: number; // timestamp
  durationMs: number;
  isStreamed: boolean;
  responseStatus: string; // "success", "error", or "HTTP <code"
  ttftMs?: number | null;
  tokensPerSec?: number | null;
  hasDebug?: boolean;
  hasError?: boolean;
  isPassthrough?: boolean;
  tokensEstimated?: number; // 0 = actual usage from provider, 1 = estimated
  createdAt?: number;
  // Request metadata
  toolsDefined?: number | null;
  messageCount?: number | null;
  parallelToolCallsEnabled?: boolean | null;
  // Response metadata
  toolCallsCount?: number | null;
  finishReason?: string | null;
  // Vision Fallthrough metadata
  isVisionFallthrough?: boolean;
  isDescriptorRequest?: boolean;
  visionFallthroughModel?: string | null;
  // Energy estimation
  kwhUsed?: number | null;
  // Provider-reported energy detail fields (from SSE `: energy` comments)
  energyAvgPowerWatts?: number | null;
  energyDurationSeconds?: number | null;
  energyAttributionMethod?: string | null;
  energyAttributionRatio?: number | null;
  energyRatioWasCapped?: number | null; // 0 or 1 (SQLite/Postgres boolean convention)
  energyUncappedKwh?: number | null;
  // Timestamp of last INSERT or UPDATE (set by DB triggers) for CDC replication
  // 0 = row predates this column (unknown modification time)
  updatedAt: number;
  // Provider-reported cost (from SSE `: cost` comments or response payload)
  // When present, costTotal/costInput/costOutput are overridden with actual values
  providerReportedCost?: number | null;
}
