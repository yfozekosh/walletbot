-- WalletBot Database Schema
-- Migration 001: Core tables, functions, and cron jobs

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ============================================================
-- APP CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET SYNC STATE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_sync_state (
    entity TEXT PRIMARY KEY,
    last_synced_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.wallet_sync_state ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
    id TEXT PRIMARY KEY,
    name TEXT,
    account_type TEXT,
    currency_code TEXT,
    color TEXT,
    archived BOOLEAN,
    init_amount TEXT,
    init_ref_amount TEXT,
    exclude_from_stats BOOLEAN,
    bank_account_number TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}',
    transfer_aliases JSONB DEFAULT '[]'::jsonb
);

ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_categories (
    id TEXT PRIMARY KEY,
    name TEXT,
    color TEXT,
    icon_name TEXT,
    cardinality TEXT,
    archived BOOLEAN,
    enabled BOOLEAN,
    custom_category BOOLEAN,
    custom_color BOOLEAN,
    custom_name BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.wallet_categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET LABELS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_labels (
    id TEXT PRIMARY KEY,
    name TEXT,
    color TEXT,
    archived BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.wallet_labels ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET BUDGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_budgets (
    id TEXT PRIMARY KEY,
    name TEXT,
    amount TEXT,
    currency_code TEXT,
    type TEXT,
    start_date TEXT,
    end_date TEXT,
    account_ids JSONB DEFAULT '[]'::jsonb,
    category_ids JSONB DEFAULT '[]'::jsonb,
    label_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.wallet_budgets ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET GOALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_goals (
    id TEXT PRIMARY KEY,
    name TEXT,
    target_amount TEXT,
    initial_amount TEXT,
    desired_date TEXT,
    state TEXT,
    state_updated_at TIMESTAMPTZ,
    color TEXT,
    icon_name TEXT,
    note TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.wallet_goals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_records (
    id TEXT PRIMARY KEY,
    account_id TEXT,
    note TEXT,
    payee TEXT,
    payer TEXT,
    amount_currency TEXT,
    amount_value TEXT,
    base_amount_currency TEXT,
    base_amount_value TEXT,
    record_date DATE,
    record_state TEXT,
    record_type TEXT,
    payment_type TEXT,
    category_id TEXT,
    category_name TEXT,
    category_color TEXT,
    label_ids JSONB DEFAULT '[]'::jsonb,
    transfer BOOLEAN,
    contact_id TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.wallet_records ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET BUDGET CATEGORY MAP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_budget_category_map (
    budget_id TEXT PRIMARY KEY,
    category_ids JSONB DEFAULT '[]'::jsonb,
    label_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    archived BOOLEAN DEFAULT false
);

ALTER TABLE public.wallet_budget_category_map ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WALLET SHOWN TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_shown_transactions (
    record_id TEXT PRIMARY KEY,
    shown_at TIMESTAMPTZ DEFAULT now(),
    trigger_type TEXT NOT NULL
);

ALTER TABLE public.wallet_shown_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CATEGORY TREE
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.category_tree_id_seq
    AS INTEGER START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.category_tree (
    id INTEGER NOT NULL DEFAULT nextval('public.category_tree_id_seq'::regclass) PRIMARY KEY,
    envelope_id INTEGER NOT NULL,
    name TEXT,
    color TEXT,
    parent_name TEXT,
    is_top_level BOOLEAN GENERATED ALWAYS AS (parent_name = 'top level'::text) STORED,
    is_technical BOOLEAN GENERATED ALWAYS AS (parent_name = 'technical'::text) STORED,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.category_tree ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS category_tree_envelope_name_uidx
    ON public.category_tree (envelope_id, COALESCE(name, ''::text));
CREATE INDEX IF NOT EXISTS category_tree_envelope_idx ON public.category_tree (envelope_id);
CREATE INDEX IF NOT EXISTS category_tree_parent_idx ON public.category_tree (parent_name);

-- ============================================================
-- CATEGORY ENVELOPE PARENT MAPPING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.category_envelope_parent_mapping (
    id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    category_name TEXT,
    envelope_id INTEGER,
    color TEXT,
    parent_group TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.category_envelope_parent_mapping ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS category_envelope_parent_mapping_category_name_envelope_id_key
    ON public.category_envelope_parent_mapping (category_name, envelope_id);
CREATE INDEX IF NOT EXISTS idx_category_envelope_parent_envelope
    ON public.category_envelope_parent_mapping (envelope_id);
CREATE INDEX IF NOT EXISTS idx_category_envelope_parent_group
    ON public.category_envelope_parent_mapping (parent_group);
CREATE INDEX IF NOT EXISTS idx_category_envelope_parent_name
    ON public.category_envelope_parent_mapping (category_name);

-- ============================================================
-- ENVELOPE GROUPS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.envelope_groups (
    id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    parent_group_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.envelope_groups ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_envelope_groups_range
    ON public.envelope_groups (range_start, range_end);

-- ============================================================
-- JIRA BUFFER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jira_buffer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.jira_buffer ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_jira_buffer_created_at ON public.jira_buffer (created_at);

-- ============================================================
-- TELEGRAM BOT STATE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.telegram_bot_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FILES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.files_id_seq
    AS BIGINT START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.files (
    id BIGINT NOT NULL DEFAULT nextval('public.files_id_seq'::regclass) PRIMARY KEY,
    original_file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    saved_file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    is_ocr_processed BOOLEAN DEFAULT false,
    ocr_file_name TEXT DEFAULT ''::text,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS files_saved_file_name_key ON public.files (saved_file_name);
CREATE UNIQUE INDEX IF NOT EXISTS files_file_hash_key ON public.files (file_hash);
CREATE INDEX IF NOT EXISTS idx_files_hash ON public.files (file_hash);

-- ============================================================
-- PARSED RECEIPTS
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.parsed_receipts_id_seq
    AS BIGINT START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.parsed_receipts (
    id BIGINT NOT NULL DEFAULT nextval('public.parsed_receipts_id_seq'::regclass) PRIMARY KEY,
    file_id BIGINT NOT NULL UNIQUE REFERENCES public.files(id),
    parsed_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.parsed_receipts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_parsed_file_id ON public.parsed_receipts (file_id);

-- ============================================================
-- PROMPTS
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.prompts_id_seq
    AS BIGINT START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.prompts (
    id BIGINT NOT NULL DEFAULT nextval('public.prompts_id_seq'::regclass) PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    content TEXT DEFAULT ''::text,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prompts_name ON public.prompts (name);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- get_wallet_balances: returns account balances aggregated from records
CREATE OR REPLACE FUNCTION public.get_wallet_balances()
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT
        a.id,
        a.name,
        a.account_type,
        COALESCE(a.currency_code, 'EUR') AS currency,
        COALESCE(a.init_amount::numeric / 100, 0) AS init_amount_cents,
        COALESCE(r_sum.total, 0) AS sum_records_cents,
        COALESCE(a.init_amount::numeric / 100, 0) + COALESCE(r_sum.total, 0) AS balance_cents,
        (COALESCE(a.init_amount::numeric / 100, 0) + COALESCE(r_sum.total, 0)) / 100 AS balance,
        COALESCE(r_sum.cnt, 0) AS record_count
      FROM wallet_accounts a
      LEFT JOIN LATERAL (
        SELECT
          SUM(amount_value::numeric) AS total,
          COUNT(*) AS cnt
        FROM wallet_records
        WHERE account_id = a.id
      ) r_sum ON true
      ORDER BY a.name
    ) t
  );
END;
$$;

-- get_wallet_budgets: returns budget progress with spent amounts
CREATE OR REPLACE FUNCTION public.get_wallet_budgets()
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT
        b.id,
        b.name,
        b.type,
        b.amount::numeric AS budget_amount,
        b.currency_code,
        b.start_date,
        bcm.category_ids,
        bcm.label_ids,
        CASE
          WHEN b.type = 'BUDGET_INTERVAL_MONTH' THEN
            date_trunc('month', CURRENT_DATE)
          WHEN b.type = 'BUDGET_INTERVAL_WEEK' THEN
            date_trunc('week', CURRENT_DATE)
        END AS period_start,
        CASE
          WHEN b.type = 'BUDGET_INTERVAL_MONTH' THEN
            (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::date
          WHEN b.type = 'BUDGET_INTERVAL_WEEK' THEN
            (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date
        END AS period_end,
        COALESCE(spent.total_cents, 0) AS spent_cents,
        ROUND(COALESCE(spent.total_cents, 0) / 100.0, 2) AS spent,
        ROUND(b.amount::numeric - COALESCE(spent.total_cents, 0) / 100.0, 2) AS remaining,
        COALESCE(spent.record_count, 0) AS record_count
      FROM wallet_budgets b
      LEFT JOIN wallet_budget_category_map bcm ON bcm.budget_id = b.id
      LEFT JOIN LATERAL (
        SELECT
          SUM(ABS(r.amount_value::numeric)) AS total_cents,
          COUNT(*) AS record_count
        FROM wallet_records r
        WHERE r.record_date >= CASE
            WHEN b.type = 'BUDGET_INTERVAL_MONTH' THEN date_trunc('month', CURRENT_DATE)
            WHEN b.type = 'BUDGET_INTERVAL_WEEK' THEN date_trunc('week', CURRENT_DATE)
          END::date
        AND r.record_date <= CASE
            WHEN b.type = 'BUDGET_INTERVAL_MONTH' THEN (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::date
            WHEN b.type = 'BUDGET_INTERVAL_WEEK' THEN (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date
          END::date
        AND (
          (bcm.category_ids IS NOT NULL AND bcm.category_ids != '[]'::jsonb
           AND r.category_id IN (SELECT jsonb_array_elements_text(bcm.category_ids)))
          OR
          (bcm.label_ids IS NOT NULL AND bcm.label_ids != '[]'::jsonb
           AND r.label_ids ?| ARRAY(SELECT jsonb_array_elements_text(bcm.label_ids)))
        )
      ) spent ON true
      WHERE b.type IN ('BUDGET_INTERVAL_MONTH', 'BUDGET_INTERVAL_WEEK')
      AND COALESCE(bcm.archived, false) = false
      ORDER BY b.name
    ) t
  );
END;
$$;

-- get_parent_group: returns parent group name for a given envelope ID
CREATE OR REPLACE FUNCTION public.get_parent_group(envelope_id INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    group_name TEXT;
BEGIN
    SELECT parent_group_name INTO group_name
    FROM public.envelope_groups
    WHERE envelope_id BETWEEN range_start AND range_end
    LIMIT 1;

    RETURN COALESCE(group_name, 'Unknown');
END;
$$;

-- check_buffer_and_poke: pokes jira-batch-sender if buffer has data
CREATE OR REPLACE FUNCTION public.check_buffer_and_poke()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM jira_buffer LIMIT 1) THEN
    PERFORM net.http_post(
      url := 'https://kiqwqrginagwykvkavdh.supabase.co/functions/v1/jira-batch-sender',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  END IF;
END;
$$;

-- ============================================================
-- CRON JOBS (create via pg_cron)
-- ============================================================
-- Wallet sync: every 29 minutes
SELECT cron.schedule(
    'Wallet sync',
    '*/29 * * * *',
    $$
    select
      net.http_post(
          url:='https://kiqwqrginagwykvkavdh.supabase.co/functions/v1/wallet-sync',
          headers:=jsonb_build_object('Authorization', 'Bearer ' || current_setting('supabase.service_role_key'), 'x-supabase-webhook-source', 'cron123'),
          body:='{ "name": "Functions" }',
          timeout_milliseconds:=5000
      );
    $$
);

-- Telegram report: daily at 07:00
SELECT cron.schedule(
    'telegram report',
    '0 7 * * *',
    $$
    select
      net.http_post(
          url:='https://kiqwqrginagwykvkavdh.supabase.co/functions/v1/wallet-balances',
          headers:=jsonb_build_object('Authorization', 'Bearer ' || current_setting('supabase.service_role_key')),
          body:='{"telegram": true, "real-chat": true}',
          timeout_milliseconds:=5000
      );
    $$
);

-- Daily reconciliation: daily at 06:00 (08:00 CEST)
SELECT cron.schedule(
    'daily-reconciliation',
    '0 6 * * *',
    $$
    SELECT net.http_post(
        url := 'https://kiqwqrginagwykvkavdh.supabase.co/functions/v1/daily-reconciliation',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
          'Content-Type', 'application/json'
        )
    ) AS request_id;
    $$
);

-- Jira buffer poke: every minute
SELECT cron.schedule(
    'jira-buffer-poke',
    '* * * * *',
    $$SELECT check_buffer_and_poke()$$
);
