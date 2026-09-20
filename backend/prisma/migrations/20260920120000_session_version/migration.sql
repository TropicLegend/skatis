-- Sitzungs-Version: Sie zaehlt, wie oft das Spielerpasswort neu gesetzt wurde.
-- Jedes Session-Token traegt die Version, mit der es ausgestellt wurde; die
-- Middleware vergleicht sie mit dieser Spalte. Ein Passwortwechsel erhoeht den
-- Wert und beendet damit alle laufenden Sitzungen - auch die des Admins, der die
-- Aenderung gemacht hat (siehe `src/lib/session-version.ts`).
--
-- Bestehende Turniere starten bei 0; Tokens, die vor dieser Migration ausgestellt
-- wurden, tragen keine Version und gelten ebenfalls als 0 - sie bleiben also bis
-- zum naechsten Passwortwechsel gueltig.
ALTER TABLE "tournaments" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
