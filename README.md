# Toma Komasa Sportistu Portāls (SK Mitauer Training Planner)

Treniņu plānošanas web lietotne trenerim un viņa ~20-25 sportistiem —
aizvieto Google Sheets, ko treneris iepriekš izmantoja treniņu plānošanai.
Mērķis: padarī trenera-sportista sadarbību pārskatāmāku un ātrāku — treneris
var ātri uzbūvēt precīzu, katram sportistam individuālu treniņu plānu,
sportists var ērti sekot līdzi savam plānam.

Dzīvo adresē `tksportisti.netlify.app`.

## Ar ko strādāt, ja gribi mainīt kodu

Šis fails (`README.md`) dod ātru pārskatu. Sīkāku, pastāvīgi atjaunotu
tehnisko informāciju par konkrētām īpatnībām, agrāk atrastām kļūdām un
lēmumu vēsturi glabā **`CLAUDE.md`** — tas ir domāts galvenokārt Claude
Code sesijām, bet noder arī jebkuram, kas grib saprast, kāpēc kāda koda
daļa uzbūvēta tieši tā, kā uzbūvēta. `TODO.md` seko līdzi vienam konkrētam,
ilgtermiņa darbam — `app.js` sadalīšanai mazākos failos.

## Tehnoloģijas

Vienkāršs, "vecmodīgs" veidols apzināti — nav būvēšanas soļa (build step),
nav pakešu pārvaldnieka (npm/webpack), nav ietvara (React/Vue u.c.):

- **Tīrs HTML/CSS/JavaScript**, ielādēts kā parasti `<script>` tagi
  `index.html` failā — pārlūks izpilda failus tieši tā, kā tie uzrakstīti,
  bez starpposma.
- **Supabase** kā aizmugure (backend): datubāze (Postgres), lietotāju
  autentifikācija un trīs nelielas servera funkcijas administrēšanas
  darbībām (skat. zemāk).
- Nav testu palaišanas rīka — pārbaude notiek, atverot lietotni pārlūkā.

## Palaišana lokāli

```bash
xdg-open index.html
```

Tā kā lietotne runā ar Supabase tieši no pārlūka (`db.js`/`auth.js`), arī
lokāli atvērts fails strādā pret **īsto, dzīvo** datubāzi — nav atsevišķas
testa/lokālās versijas. Testēšanai izmanto kontu "Testa Sportists", nevis
kāda reāla sportista kontu.

## Failu struktūra

```text
index.html          — lapas "skelets": abi skati (pieteikšanās/lietotne),
                       visi paneļi/dialogi jau iepriekš uzrakstīti HTML,
                       tikai paslēpti/parādīti pēc vajadzības
auth.js              — pieteikšanās, sesija, konta pārslēgšana, paroles maiņa
db.js                — VIENĪGAIS fails, kas runā ar Supabase datubāzi
date-picker.js       — pašrakstīts kalendāra logrīks datumu laukiem
                       (pārlūka iebūvētais nerāda latviski/pirmdienu pirmo)
app.js               — kalendāra zīmēšana, treniņu veidotājs, galvenā
                       lietotnes loģika (skat. zemāk)
panels/*.js          — atsevišķi izdalītas funkcionalitātes (skat. zemāk)
styles.css           — visi stili
images/              — logotipi u.c. attēli
supabase/functions/  — trīs servera funkcijas (create-user, delete-user,
                       reset-password), kas prasa slepenu atslēgu, kuru
                       nedrīkst atklāt pārlūkā
```

Ielādes secība `index.html`: `auth.js` → `db.js` → `date-picker.js` →
visi `panels/*.js` → `app.js` (pēdējais). Paneļu faili ielādējas pirms
`app.js`, jo `app.js` satur pārbaudi "vai kāds jau ir pieteicies", kas var
uzreiz izsaukt kāda paneļa zīmēšanas funkciju.

### `panels/` — pa vienam katrai lietotnes sadaļai

| Fails | Ko dara |
| --- | --- |
| `profile.js` | Sportista profila kartiņa, saites (Garmin/Strava/arhīvs), HR darba zonas, sliekšņvērtības, "Temps pret sirdsritmu" |
| `stats.js` | "Paveiktā statistika" — nedēļas/mēneša slodzes grafiki |
| `interval-history.js` | "Nesenākie intervālu un tempa skrējieni" |
| `restrictions.js` | Ierobežojumi (dienas/laiki, kad sportists nedrīkst trenēties) |
| `races.js` | Sacensību kalendārs, rezultāti |
| `records.js` | Personīgie rekordi |
| `diary.js` | Dienasgrāmata |
| `health-journal.js` | Veselības žurnāls |
| `self-tests.js` | Paštesti (lokanība/mobilitāte) |
| `polar-tests.js` | Polar testi (MAS/MAP/VO2max/laktāts) |
| `ruffier-test.js` | Rufjē tests (sirdsdarbības atjaunošanās pēc slodzes) |
| `lactate-test.js` | Laktāta tests (kāpjošs tests, LT1/LT2 sliekšņi) |
| `lab-tests.js` | Laboratorijas izmeklējumi (PDF/attēlu augšupielāde) |
| `self-log.js` | Sportists pats ieraksta izpildītu treniņu, ko treneris nebija ieplānojis |
| `admin.js` | Trenera: jauna sportista izveide, dzēšana, paroles atiestatīšana |
| `weekly-review.js` | Tabula ar visiem sportistiem uzreiz — kuras nedēļas apskatītas |

Katrs panelis satur savu stāvokli, savu `render*()` funkciju un savu
saglabāšanas/dzēšanas loģiku, bet dalās vienā globālajā skatā ar `app.js`
(nav moduļu/importu — visi faili "redz" viens otra funkcijas un
mainīgos).

### Kas paliek `app.js`

Viss, kas nav izdalīts panelī — galvenokārt lietotnes "kodols", kas ir
pārāk savīts, lai to droši atdalītu:

- Kalendāra (nedēļas un mēneša skata) zīmēšana
- Treniņa veidotājs un sagataves ("Izveidot jaunu treniņu")
- Treniņa izpildījuma ierakstīšanas dialogi
- Globālais stāvoklis (izvēlētais sportists, nedēļa, ielādētie plāni utt.)

`app.js` pats ir sadalīts loģiskās daļās ar sakļaujamiem `// #region ...`
komentāriem — VSCode tos rāda kā sekcijas, ko var aizvērt/atvērt.

## Galvenie principi

**Divas lomas: `coach` un `athlete`.** Treneris izvēlas sportistu no
nolaižamā saraksta un redz/labo visu; sportists redz tikai savus datus.
Daudzas `render*` funkcijas atzarojas atkarībā no lomas (`isCoach()`).

**Dati plūst vienā virzienā, ar rokas atsvaidzināšanu.** Nav automātiskas
sinhronizācijas reāllaikā. Modelis: (1) `db.js` funkcija paņem/maina rindu
Supabase, (2) izsaucējs pārraksta atbilstošo globālo sarakstu
(`plans`, `templates`, `restrictions`, ...), (3) izsaucējs izsauc atbilstošo
`render*()`, kas no jauna uzzīmē to lapas daļu. Ja pēc izmaiņas aizmirst
izsaukt `render*()`, ekrānā redzamais un patiesie dati izklīst.

**Treniņa apraksts ("details") ir strukturēts teksts, nevis brīva proza.**
Katrs treniņš datubāzē glabājas kā viens garš teksts ar rindiņām
("Iesildīšanās: 15min; 120-130", "Pamatdaļa: 6x400m (76-78s); caur 2min"),
kur katrā rindā lauki ir stingri fiksētā secībā, atdalīti ar `;`. To lasošais
un rakstošais kods jāskata kā ieraksta lauku parsēšanu, nevis kā teksta
rediģēšanu — sīkāk CLAUDE.md.

**Divvirzienu labošana ar "jauns ieraksts" nozīmīti.** Vairākas sadaļas
(HR zonas, sliekšņvērtības, temps/pulss tabula, laktāta testi) drīkst labot
gan treneris, gan sportists. Katra glabā "kurš un kad pēdējo reizi labojis"
datubāzes ierakstā un rāda sarkanu skaitlīti otrai pusei, kamēr tā nav
paskatījusies — bez jaunas tabulas, jo Supabase shēmu mainīt nevar bez
piekļuves datubāzei ārpus lietotnes.

**Nekas nav Supabase realtime — atsvaidzina, pārlādējot/pārslēdzot.** Ja
divi cilvēki skatās vienlaicīgi un viens saglabā izmaiņas, otrs tās redzēs
tikai nākamajā ielādē (cita sportista/nedēļas izvēlē vai lapas pārlādē).

## Nākamie soļi

Skaties `TODO.md` — tur seko līdzi, cik tālu tikuši ar `app.js`
sadalīšanu mazākos failos, un `CLAUDE.md`, kur ir apkopota visa pārējā
lēmumu vēsture un zināmās "āķīgās" vietas kodā.
