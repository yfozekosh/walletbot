import { config } from "./config.ts";

class RetryableError extends Error {
  constructor(message: string, public readonly waitSeconds: number = 0) {
    super(message);
  }
}

class WalletApiError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WalletApiClient {
  constructor(private token: string) {}

  private async request(
    endpoint: string,
    params: Record<string, string | number | string[]>
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${config.walletBaseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v);
      else url.searchParams.set(key, String(value));
    }
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (response.status === 429) {
      const wait = parseInt(response.headers.get("Retry-After") ?? "60", 10);
      throw new RetryableError("rate limited", wait);
    }
    if (response.status === 409) {
      const body = await response.json();
      throw new RetryableError("sync in progress", (body.retry_after_minutes ?? 5) * 60);
    }
    if (!response.ok)
      throw new WalletApiError(`HTTP ${response.status} on ${endpoint}: ${await response.text()}`);
    return response.json();
  }

  async get(
    endpoint: string,
    params: Record<string, string | number | string[]>
  ): Promise<Record<string, unknown>> {
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        return await this.request(endpoint, params);
      } catch (err) {
        if (err instanceof RetryableError) {
          if (attempt === config.maxRetries)
            throw new WalletApiError(`Giving up on ${endpoint} after ${config.maxRetries} attempts: ${err.message}`);
          const wait = err.waitSeconds || config.retryBackoffBase ** attempt;
          console.warn(`${endpoint}: retrying in ${wait}s (attempt ${attempt}/${config.maxRetries})`);
          await sleep(wait * 1000);
        } else throw err;
      }
    }
    throw new WalletApiError(`Failed to fetch ${endpoint}`);
  }

  async* fetchAllRecords(dateRange?: [string, string]): AsyncGenerator<Record<string, unknown>> {
    const params: Record<string, string | number | string[]> = { limit: config.pageSize, offset: 0 };
    if (dateRange) {
      params["recordDate"] = [`gte.${dateRange[0]}`, `lte.${dateRange[1]}`];
    }
    while (true) {
      const page = await this.get("/v1/api/records", params);
      const items = (page["records"] as Record<string, unknown>[]) ?? [];
      if (items.length === 0) break;
      yield* items;
      const nextOffset = page["nextOffset"];
      if (!nextOffset) break;
      params["offset"] = nextOffset as number;
    }
  }

  async fetchRecordsInDateChunks(chunkDays: number): Promise<Record<string, unknown>[]> {
    const allItems: Record<string, unknown>[] = [];
    const seenIds = new Set<string>();
    let chunkEnd = new Date();
    const limit = new Date();
    limit.setFullYear(limit.getFullYear() - config.maxYearsBack);

    console.log(`  Fetching records in ${chunkDays}-day chunks...`);

    while (true) {
      const chunkStart = new Date(chunkEnd.getTime() - chunkDays * 86400000);
      if (chunkStart < limit) {
        console.log("  Reached 10-year limit, stopping");
        break;
      }
      const dateRange: [string, string] = [
        chunkStart.toISOString().slice(0, 10),
        chunkEnd.toISOString().slice(0, 10),
      ];
      console.log(`  Chunk: ${dateRange[0]} -> ${dateRange[1]}`);

      let chunkCount = 0;
      for await (const item of this.fetchAllRecords(dateRange)) {
        if (!seenIds.has(item["id"] as string)) {
          seenIds.add(item["id"] as string);
          allItems.push(item);
          chunkCount++;
        }
      }
      console.log(`  Got ${chunkCount} new items, total: ${allItems.length}`);
      if (chunkCount === 0) break;
      chunkEnd = chunkStart;
    }
    return allItems;
  }
}
