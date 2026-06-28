import { WalletApiClient } from "./api-client.ts";
import { createRepository, DatabaseRepository } from "./database-repository.ts";
import { SYNCERS } from "./syncer-registry.ts";
import { Reconciler } from "./reconciler.ts";
import { SyncConfig, SyncStats, SyncMode, EntitySyncer } from "./types.ts";

function verifyServiceRole(req: Request): Response | null {
  const auth = req.headers.get("Authorization");
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (auth !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 403 });
  }
  return null;
}

function loadConfig(): SyncConfig {
  const walletToken = Deno.env.get("WALLET_TOKEN");
  if (!walletToken) throw new Error("WALLET_TOKEN env var is required");
  const rawMode = Deno.env.get("WALLET_SYNC_MODE") ?? "amend";
  if (rawMode !== "amend" && rawMode !== "rewrite")
    throw new Error(`Invalid WALLET_SYNC_MODE: ${rawMode}`);
  return { walletToken, mode: rawMode };
}

async function syncEntity(
  syncer: EntitySyncer,
  apiClient: WalletApiClient,
  repo: DatabaseRepository,
  mode: SyncMode,
  syncStart: string
): Promise<SyncStats> {
  console.log(`Syncing ${syncer.entityName} (mode=${mode})...`);

  if (syncer.dateChunkDays) {
    console.log(`  Using date-chunked fetch...`);
    const items = await apiClient.fetchRecordsInDateChunks(syncer.dateChunkDays);
    console.log(`  Fetched ${items.length} items`);

    if (items.length > 0) {
      const rows = items.map((item) => syncer.transform(item));
      const stats = await repo.upsertRows(syncer.tableName, rows, syncer.preserveLocalFields);
      console.log(`  Added: ${stats.added}, Updated: ${stats.updated}`);
      await repo.setSyncState(syncer.entityName, syncStart);
      return stats;
    } else {
      await repo.setSyncState(syncer.entityName, syncStart);
      return { fetched: 0, added: 0, updated: 0 };
    }
  }

  let updatedAfter: string | undefined;
  if (!syncer.alwaysFullFetch && mode === "amend") {
    const last = await repo.getSyncState(syncer.entityName);
    if (last) {
      updatedAfter = last;
      console.log(`  Changes since ${updatedAfter}`);
    } else {
      console.log("  No prior sync state - full initial fetch");
    }
  } else if (syncer.alwaysFullFetch) {
    console.log(`  Always-full-fetch`);
  } else {
    console.log("  Rewrite mode - fetching all");
  }

  const items: Record<string, unknown>[] = [];
  const params: Record<string, string | number | string[]> = { limit: syncer.pageLimit ?? 200, offset: 0 };
  if (updatedAfter) params["updatedAt"] = `gte.${updatedAfter}`;

  while (true) {
    const page = await apiClient.get(syncer.endpoint, params);
    const pageItems = (page[syncer.responseKey] as Record<string, unknown>[]) ?? [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    const nextOffset = page["nextOffset"];
    if (!nextOffset) break;
    params["offset"] = nextOffset as number;
  }

  console.log(`  Fetched ${items.length} items`);

  if (items.length > 0) {
    const rows = items.map((item) => syncer.transform(item));
    const stats = await repo.upsertRows(syncer.tableName, rows, syncer.preserveLocalFields);
    console.log(`  Added: ${stats.added}, Updated: ${stats.updated}`);
    await repo.setSyncState(syncer.entityName, syncStart);
    return stats;
  } else {
    await repo.setSyncState(syncer.entityName, syncStart);
    return { fetched: 0, added: 0, updated: 0 };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (req.method === "POST") {
    const authErr = verifyServiceRole(req);
    if (authErr) return authErr;
  }

  const syncStart = new Date().toISOString();
  const failed: string[] = [];
  const entityStats: Record<string, SyncStats> = {};

  let syncConfig: SyncConfig;
  try {
    syncConfig = loadConfig();
  } catch (err) {
    console.error("Config error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body.mode === "rewrite" || body.mode === "amend") {
        console.log(`Mode override from request body: ${body.mode}`);
        syncConfig.mode = body.mode;
      }
    } catch (err) {
      console.log("No valid body, using default mode:", syncConfig.mode);
    }
  }

  const apiClient = new WalletApiClient(syncConfig.walletToken);
  const repo = createRepository();
  const reconciler = new Reconciler(apiClient, repo);

  for (const syncer of SYNCERS) {
    try {
      const stats = await syncEntity(syncer, apiClient, repo, syncConfig.mode, syncStart);
      entityStats[syncer.entityName] = stats;
    } catch (err) {
      console.error(`Error syncing '${syncer.entityName}':`, err);
      failed.push(syncer.entityName);
      entityStats[syncer.entityName] = { fetched: 0, added: 0, updated: 0, error: String(err) };
    }
  }

  let reconcileResult = { deleted: 0, windowStart: "", windowEnd: "" };
  try {
    reconcileResult = await reconciler.run();
    console.log(`  Reconcile complete: deleted ${reconcileResult.deleted} orphaned records`);
  } catch (err) {
    console.error("Reconcile step failed:", err);
    failed.push("reconcile");
  }

  const ok = failed.length === 0;
  return new Response(
    JSON.stringify({
      sync_start: syncStart,
      mode: syncConfig.mode,
      succeeded: SYNCERS.length - failed.filter(f => f !== "reconcile").length,
      total: SYNCERS.length,
      failed,
      entities: entityStats,
      reconcile: {
        window: `${reconcileResult.windowStart} -> ${reconcileResult.windowEnd}`,
        deleted: reconcileResult.deleted,
      },
      status: ok ? "ok" : "partial_failure",
    }, null, 2),
    { status: ok ? 200 : 207, headers: { "Content-Type": "application/json" } }
  );
});
