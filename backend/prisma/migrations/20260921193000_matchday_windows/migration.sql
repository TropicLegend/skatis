-- Optionale Spielzeit ("von"-"bis") je Spieltag. Die Struktur ist eine Abbildung
-- Wochentag -> { from, to } in "HH:MM", z. B. { "3": { "from": "18:00", "to": "22:30" } }.
-- Ein Tag ohne Eintrag wird "ganzen Tag" gespielt. Nach der "bis"-Zeit gelten die
-- Listen des Tages als abgegeben, vor der "von"-Zeit dürfen Mitglieder keine Liste
-- anlegen (siehe `src/modules/lists/list-access.ts`).
ALTER TABLE "tournaments" ADD COLUMN "matchdayWindows" JSONB;
