-- Atrod un iztīra divkāršus izpildījuma (log_entries) ierakstus - gadījumu, kad
-- viens un tas pats treniņš tika saglabāts divreiz un abi ieraksti palika
-- datubāzē (redzams mēneša skata "Izpildīts" cilnē kā dubultots ieraksts).
--
-- Iekopēt Supabase -> SQL Editor -> New query.
--
-- 1. SOLIS - vispirms tikai PASKATIES, vai kaut kas tāds ir (nekas netiek
-- dzēsts). Iezīmē un palaid ŠO daļu:

select plan_id, count(*) as cik_ierakstu, array_agg(id) as ieraksta_id
from public.log_entries
where plan_id is not null
group by plan_id
having count(*) > 1;

-- Ja rezultāts tukšs - dublikātu nav, nekas vairāk nav jādara.
--
-- Ja kāda rinda parādās, tas nozīmē - tieši tam treniņam (plan_id) ir vairāk
-- par vienu izpildījuma ierakstu. 2. SOLIS - lai iztīrītu, iezīmē un palaid
-- ŠO daļu (tā katram šādam plan_id patur JAUNĀKO ierakstu un izdzēš pārējos):

delete from public.log_entries
where id in (
  select id from (
    select id,
           row_number() over (
             partition by plan_id
             order by created_at desc nulls last, id desc
           ) as rn
    from public.log_entries
    where plan_id is not null
  ) t
  where t.rn > 1
);

-- Pēc tam vari atkārtoti palaist 1. soli, lai pārliecinātos, ka rezultāts
-- tagad ir tukšs.
