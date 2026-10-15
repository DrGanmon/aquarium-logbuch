export const AI_METRIC_PROVIDERS = ['openai', 'gemini', 'claude'] as const;
export type AiMetricProvider = typeof AI_METRIC_PROVIDERS[number];

function tokenCount(value: unknown): number | null {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function normalizeAiUsage(provider: string, usage: any) {
  if (!AI_METRIC_PROVIDERS.includes(provider as AiMetricProvider)) return null;
  const input = tokenCount(usage?.prompt_tokens ?? usage?.promptTokenCount ?? usage?.input_tokens);
  const output = tokenCount(usage?.completion_tokens ?? usage?.candidatesTokenCount ?? usage?.output_tokens);
  const reportedTotal = tokenCount(usage?.total_tokens ?? usage?.totalTokenCount);
  const inputTokens = input ?? 0;
  const outputTokens = output ?? 0;
  return { inputTokens, outputTokens, totalTokens: reportedTotal ?? inputTokens + outputTokens };
}

export function buildAdminMetrics(counts: {
  users: number;
  verifiedUsers: number;
  aquariums: number;
  measurements: number;
  logbookEntries: number;
  socialPosts: number;
  animals: number;
  activeSessions: number;
}, usageRows: Array<Record<string, unknown>>) {
  const perUserAverage = (count: number) => counts.users ? Math.round((count / counts.users) * 100) / 100 : 0;
  const providers = Object.fromEntries(AI_METRIC_PROVIDERS.map(provider => {
    const row = usageRows.find(item => item.provider === provider) || {};
    return [provider, {
      requests: Number(row.request_count) || 0,
      inputTokens: Number(row.input_tokens) || 0,
      outputTokens: Number(row.output_tokens) || 0,
      totalTokens: Number(row.total_tokens) || 0,
    }];
  })) as Record<AiMetricProvider, { requests: number; inputTokens: number; outputTokens: number; totalTokens: number }>;
  return {
    users: { total: counts.users, verified: counts.verifiedUsers },
    aquariums: { total: counts.aquariums, perUserAverage: perUserAverage(counts.aquariums) },
    measurements: { total: counts.measurements, perUserAverage: perUserAverage(counts.measurements) },
    logbookEntries: { total: counts.logbookEntries, perUserAverage: perUserAverage(counts.logbookEntries) },
    socialPosts: counts.socialPosts,
    animals: counts.animals,
    activeSessions: counts.activeSessions,
    ai: {
      requests: Object.values(providers).reduce((sum, item) => sum + item.requests, 0),
      totalTokens: Object.values(providers).reduce((sum, item) => sum + item.totalTokens, 0),
      providers,
    },
  };
}