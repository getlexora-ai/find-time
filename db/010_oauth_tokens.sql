-- find_time — 010 OAuth token store.
--
-- db/001_core.sql deliberately left tokens OUT of connected_accounts: "PLAN.md §5
-- requires AES-256-GCM at rest ... inventing the column shape without the
-- encryption is how tokens end up in plaintext". This is that column shape, now
-- that the encryption exists (src/server/crypto.ts).
--
-- One row per connected_accounts row. Values are AES-256-GCM ciphertext
-- (iv ‖ tag ‖ data), never readable text. Written only by
-- src/server/google/oauth.ts.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/010_oauth_tokens.sql

create table if not exists oauth_tokens (
  connected_account_id text primary key references connected_accounts (id) on delete cascade,
  access_token_enc     bytea not null,
  refresh_token_enc    bytea,                 -- null when Google withholds one (no prompt=consent)
  expiry               timestamptz not null,  -- access-token expiry; refresh happens ~60s before
  scope                text not null default '',
  updated_at           timestamptz not null default now()
);

drop trigger if exists oauth_tokens_updated_at on oauth_tokens;
create trigger oauth_tokens_updated_at before update on oauth_tokens
  for each row execute function set_updated_at();
