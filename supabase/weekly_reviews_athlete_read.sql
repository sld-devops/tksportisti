-- Lets an athlete READ their own "Nedēļa apskatīta" ticks (table weekly_reviews).
-- Without it the coach's tick is saved and the e-mail goes out, but the athlete's
-- portal shows an empty box. Run once in Supabase: SQL Editor -> New query ->
-- paste -> Run. Safe to run twice.

alter table public.weekly_reviews enable row level security;

drop policy if exists weekly_reviews_select_own on public.weekly_reviews;
create policy weekly_reviews_select_own
  on public.weekly_reviews
  for select
  to authenticated
  using (auth.uid() = athlete_id);
