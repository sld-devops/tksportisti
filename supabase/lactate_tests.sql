-- Laktāta testa tabula.
--
-- Iekopēt Supabase -> SQL Editor -> New query, nospiest Run.
-- Var palaist arī atkārtoti: viss ir "if not exists" / "drop policy if exists".
--
-- Viena rinda = viens tests. Posmi (temps, pulss, laktāts, sajūta) glabājas
-- vienā JSON laukā "steps", nevis atsevišķā tabulā, jo tie vienmēr tiek
-- lasīti un saglabāti kopā ar testu - tāpat kā hr_zones profilā.

create table if not exists public.lactate_tests (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  date        date not null,
  stage_min   numeric,          -- viena posma garums minūtēs (3, 4, 5)
  notes       text,             -- kur, uz kā, laika apstākļi
  steps       jsonb not null default '[]'::jsonb,
  edited_by   text,             -- 'coach' vai 'athlete' - kas pēdējais laboja
  edited_at   timestamptz default now(),
  created_at  timestamptz default now()
);

create index if not exists lactate_tests_athlete_date_idx
  on public.lactate_tests (athlete_id, date desc);

alter table public.lactate_tests enable row level security;

-- Sportists redz un labo savus; treneris - visus.
drop policy if exists lactate_tests_select on public.lactate_tests;
create policy lactate_tests_select on public.lactate_tests
  for select using (
    athlete_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );

drop policy if exists lactate_tests_insert on public.lactate_tests;
create policy lactate_tests_insert on public.lactate_tests
  for insert with check (
    athlete_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );

drop policy if exists lactate_tests_update on public.lactate_tests;
create policy lactate_tests_update on public.lactate_tests
  for update using (
    athlete_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  ) with check (
    athlete_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );

drop policy if exists lactate_tests_delete on public.lactate_tests;
create policy lactate_tests_delete on public.lactate_tests
  for delete using (
    athlete_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'coach')
  );
