-- Paziņojumu e-pasta adrese profilā (sportistam un trenerim).
--
-- Iekopēt Supabase -> SQL Editor -> New query, nospiest Run.
-- Var palaist arī atkārtoti: "if not exists" nesabojā jau esošu kolonnu.
--
-- Lietotāji lietotnē pieslēdzas ar izdomātu e-pastu (vards.uzvards@skmitauer.app),
-- kas nav derīgs vēstuļu sūtīšanai - šis lauks glabā īsto adresi, uz kuru sūtīt
-- paziņojumus par izmaiņām kalendārā. Nav obligāts - kamēr tas nav aizpildīts,
-- attiecīgajam cilvēkam vienkārši netiek sūtīti paziņojumi.

alter table public.profiles
  add column if not exists notify_email text;
