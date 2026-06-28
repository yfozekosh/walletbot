export interface SyncConfig {
  walletToken: string;
  mode: SyncMode;
}

export type SyncMode = "amend" | "rewrite";

export interface SyncStats {
  fetched?: number;
  added: number;
  updated: number;
  error?: string;
}

export interface ReconcileResult {
  deleted: number;
  windowStart: string;
  windowEnd: string;
}

export interface EntitySyncer {
  entityName: string;
  endpoint: string;
  responseKey: string;
  tableName: string;
  alwaysFullFetch?: boolean;
  dateChunkDays?: number;
  pageLimit?: number;
  preserveLocalFields?: string[];
  transform: (item: Record<string, unknown>) => Record<string, unknown>;
}
