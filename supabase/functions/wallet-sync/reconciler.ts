import { config } from "./config.ts";
import { WalletApiClient } from "./api-client.ts";
import { DatabaseRepository } from "./database-repository.ts";
import { ReconcileResult } from "./types.ts";

export class Reconciler {
  constructor(
    private apiClient: WalletApiClient,
    private repo: DatabaseRepository,
  ) {}

  async run(): Promise<ReconcileResult> {
    const today = new Date();
    const windowStart = new Date(
      today.getTime() - config.reconcileDays * 86400000,
    )
      .toISOString().slice(0, 10);
    const windowEnd = today.toISOString().slice(0, 10);

    console.log(`  Reconciling records from ${windowStart} to ${windowEnd}...`);

    const apiIds = new Set<string>();
    for await (
      const item of this.apiClient.fetchAllRecords([windowStart, windowEnd])
    ) {
      apiIds.add(item["id"] as string);
    }
    console.log(`  API returned ${apiIds.size} record IDs`);

    const localIds = await this.repo.getLocalRecordIds(windowStart, windowEnd);
    console.log(`  Local DB has ${localIds.size} record IDs`);

    const toDelete: string[] = [];
    for (const id of localIds) {
      if (!apiIds.has(id)) toDelete.push(id);
    }

    if (toDelete.length === 0) {
      console.log("  No orphaned records found");
      return { deleted: 0, windowStart, windowEnd };
    }

    console.log(`  Deleting ${toDelete.length} orphaned records`);
    await this.repo.deleteRecords(toDelete);
    return { deleted: toDelete.length, windowStart, windowEnd };
  }
}
