-- Eliptiskā trenažiera stundas nedēļas skaitļos ("Paveiktā statistika").
-- Iekopēt Supabase -> SQL Editor -> New query, nospiest Run. Var palaist atkārtoti.
alter table public.weekly_summaries add column if not exists elipt_min numeric;
