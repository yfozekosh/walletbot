import { EntitySyncer } from "./types.ts";

function strOrNull(value: unknown): string | null {
  return value != null ? String(value) : null;
}

function extractIds(objects: Record<string, unknown>[]): string[] {
  return objects.filter((o) => o["id"]).map((o) => o["id"] as string);
}

export const SYNCERS: EntitySyncer[] = [
  {
    entityName: "accounts",
    endpoint: "/v1/api/accounts",
    responseKey: "accounts",
    tableName: "wallet_accounts",
    alwaysFullFetch: true,
    preserveLocalFields: ["currency_code", "transfer_aliases"],
    transform: (i) => ({
      id: i["id"],
      name: i["name"],
      account_type: i["accountType"],
      currency_code: i["currencyCode"],
      color: i["color"],
      archived: i["archived"],
      init_amount: i["initialBalance"]?.["value"] != null
        ? String(Math.round(i["initialBalance"]["value"] * 10000))
        : null,
      init_ref_amount: i["initialBalance"]?.["value"] != null
        ? String(Math.round(i["initialBalance"]["value"] * 10000))
        : null,
      exclude_from_stats: i["excludeFromStats"],
      bank_account_number: i["bankAccountNumber"],
      created_at: i["createdAt"],
      updated_at: i["updatedAt"],
      raw: i,
    }),
  },
  {
    entityName: "categories",
    endpoint: "/v1/api/categories",
    responseKey: "categories",
    tableName: "wallet_categories",
    transform: (i) => ({
      id: i["id"],
      name: i["name"],
      color: i["color"],
      icon_name: i["iconName"],
      cardinality: i["cardinality"],
      archived: i["archived"],
      enabled: i["enabled"],
      custom_category: i["customCategory"],
      custom_color: i["customColor"],
      custom_name: i["customName"],
      created_at: i["createdAt"],
      updated_at: i["updatedAt"],
      raw: i,
    }),
  },
  {
    entityName: "labels",
    endpoint: "/v1/api/labels",
    responseKey: "labels",
    tableName: "wallet_labels",
    transform: (i) => ({
      id: i["id"],
      name: i["name"],
      color: i["color"],
      archived: i["archived"],
      created_at: i["createdAt"],
      updated_at: i["updatedAt"],
      raw: i,
    }),
  },
  {
    entityName: "budgets",
    endpoint: "/v1/api/budgets",
    responseKey: "budgets",
    tableName: "wallet_budgets",
    alwaysFullFetch: true,
    preserveLocalFields: ["amount"],
    pageLimit: 20,
    transform: (i) => {
      const categories = (i["categories"] as Record<string, unknown>[]) ?? [];
      const labels = (i["labels"] as Record<string, unknown>[]) ?? [];
      return {
        id: i["id"],
        name: i["name"],
        amount: strOrNull(i["amount"]),
        currency_code: i["currencyCode"],
        type: i["type"],
        start_date: i["startDate"],
        end_date: i["endDate"],
        account_ids: i["accountIds"] ?? [],
        category_ids: extractIds(categories),
        label_ids: extractIds(labels),
        created_at: i["createdAt"],
        updated_at: i["updatedAt"],
        raw: i,
      };
    },
  },
  {
    entityName: "goals",
    endpoint: "/v1/api/goals",
    responseKey: "goals",
    tableName: "wallet_goals",
    transform: (i) => ({
      id: i["id"],
      name: i["name"],
      target_amount: strOrNull(i["targetAmount"]),
      initial_amount: strOrNull(i["initialAmount"]),
      desired_date: i["desiredDate"],
      state: i["state"],
      state_updated_at: i["stateUpdatedAt"],
      color: i["color"],
      icon_name: i["iconName"],
      note: i["note"],
      created_at: i["createdAt"],
      updated_at: i["updatedAt"],
      raw: i,
    }),
  },
  {
    entityName: "records",
    endpoint: "/v1/api/records",
    responseKey: "records",
    tableName: "wallet_records",
    dateChunkDays: 90,
    transform: (i) => {
      const amt = (i["amount"] as Record<string, unknown>) ?? {};
      const bAmt = (i["baseAmount"] as Record<string, unknown>) ?? {};
      const cat = (i["category"] as Record<string, unknown>) ?? {};
      const labels = (i["labels"] as Record<string, unknown>[]) ?? [];
      return {
        id: i["id"],
        account_id: i["accountId"],
        note: i["note"],
        payee: i["payee"],
        payer: i["payer"],
        amount_currency: amt["currencyCode"],
        amount_value: amt["value"] != null ? String(Math.round((amt["value"] as number) * 100)) : null,
        base_amount_currency: bAmt["currencyCode"],
        base_amount_value: bAmt["value"] != null ? String(Math.round((bAmt["value"] as number) * 100)) : null,
        record_date: i["recordDate"],
        record_state: i["recordState"],
        record_type: i["recordType"],
        payment_type: i["paymentType"],
        category_id: cat["id"],
        category_name: cat["name"],
        category_color: cat["color"],
        label_ids: extractIds(labels),
        transfer: i["transfer"],
        contact_id: i["contactId"],
        latitude: i["latitude"],
        longitude: i["longitude"],
        created_at: i["createdAt"],
        updated_at: i["updatedAt"],
        raw: i,
      };
    },
  },
];
