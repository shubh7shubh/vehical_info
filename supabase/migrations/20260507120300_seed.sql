-- Seed data — Phase 2

insert into public.banks (name, color) values
  ('Bank A', '#2563eb'),
  ('Bank B', '#16a34a')
on conflict (name) do nothing;

-- After creating your first user via Supabase Dashboard → Authentication → Users,
-- run this to promote them to admin:
--
--   update public.users set role = 'admin'
--   where email = 'your-admin-email@example.com';
--
-- To bootstrap a sub-id later:
--
--   update public.users
--   set role = 'sub_id', sub_id_range_start = 1, sub_id_range_end = 500
--   where email = 'entry-a@example.com';
