# walletbot

Wallet data sync, financial reporting, and Jira notifications via Supabase Edge Functions + Telegram.

## Architecture

```
BudgetBakers API  ──►  wallet-sync  ──► Supabase DB
                        (every 29min)

Supabase DB       ──►  wallet-balances ──► Telegram
                        (daily 07:00)

Supabase DB       ──►  wallet-transactions ──► Telegram
                        (cron / /transactions command)

Google Sheets     ──►  daily-reconciliation ──► Telegram
                        (daily 06:00)

Jira webhook      ──►  jira-telegram ──► jira_buffer ──► jira-batch-sender ──► Telegram
                                     (every 1min)

Telegram          ──►  telegram-bot (webhook)
  /sync               ──► wallet-sync
  /report             ──► wallet-balances
  /transactions [N]   ──► wallet-transactions
```

## Edge Functions

| Function | Trigger | Purpose | Auth |
|---|---|---|---|
| `wallet-sync` | Cron `*/29 * * * *` | Sync accounts, categories, labels, budgets, records from BudgetBakers API | Service role key |
| `wallet-balances` | Cron `0 7 * * *` / Telegram `/report` | Account balances, cashflow, pending transfers | Service role key |
| `wallet-transactions` | Cron / Telegram `/transactions N` | Show transactions for a given date | Service role key |
| `daily-reconciliation` | Cron `0 6 * * *` | Compare Google Sheets planned expenses vs DB actuals | Service role key |
| `telegram-bot` | Telegram webhook | Route `/sync`, `/report`, `/transactions` commands | Webhook secret |
| `jira-telegram` | Jira webhook | Receive Jira webhooks, buffer into `jira_buffer` | HMAC-SHA256 |
| `jira-batch-sender` | Cron `* * * * *` (via `check_buffer_and_poke()`) | Batch-send buffered Jira updates to Telegram | Service role key |

## Database

18 tables: `wallet_accounts`, `wallet_records`, `wallet_categories`, `wallet_labels`, `wallet_budgets`, `wallet_goals`, `wallet_sync_state`, `wallet_budget_category_map`, `wallet_shown_transactions`, `app_config`, `jira_buffer`, `telegram_bot_state`, `category_tree`, `category_envelope_parent_mapping`, `envelope_groups`, `files`, `parsed_receipts`, `prompts`.

4 functions: `get_wallet_balances()`, `get_wallet_budgets()`, `get_parent_group()`, `check_buffer_and_poke()`.

See `supabase/migrations/001_schema.sql`.

## Deploy

```bash
# Prerequisites: supabase CLI, Deno
./deploy.sh <project-ref>

# Or via Makefile
make deploy PROJECT_REF=<project-ref>
```

Each function needs its env vars set in the Supabase dashboard. See `.env.example` files.

## Development

```bash
# Format all code
make fmt        # deno fmt .

# Check formatting
make check      # deno fmt --check .

# Install supabase CLI for local development
# supabase init && supabase start
```

## Secrets

Secrets stored in `app_config` DB table (not env vars):
- `GCP_SERVICE_ACCOUNT_KEY` — JSON key for Google Sheets access
- `SHEET_ID` — Google Sheet ID for reconciliation
