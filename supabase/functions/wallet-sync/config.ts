export const config = {
  walletBaseUrl: "https://rest.budgetbakers.com/wallet",
  pageSize: 200,
  maxRetries: 5,
  retryBackoffBase: 2,
  reconcileDays: 10,
  dbBatchSize: 50,
  recordChunkDays: 90,
  maxYearsBack: 10,
} as const;
