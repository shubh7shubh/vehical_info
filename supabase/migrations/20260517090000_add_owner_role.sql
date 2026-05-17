-- Phase 2.7 — Multi-Branch Foundation (1/6): add the `owner` role.
--
-- This MUST be its own migration file. Postgres does not allow a value added
-- by `ALTER TYPE ... ADD VALUE` to be used (in CHECKs, policies, function
-- bodies that cast the literal) within the same transaction. `supabase db push`
-- runs each migration file in its own transaction, so a file boundary is the
-- commit boundary. Files D/E/F that reference 'owner' come in later files.

alter type app_role add value if not exists 'owner';
