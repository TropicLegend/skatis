-- One matchday can be played at several tables, so a tournament may have more
-- than one list for the same date. The pair stays indexed for the date filters
-- of GET /lists and for the standing, but it is no longer unique.
DROP INDEX "game_lists_tournamentId_matchday_key";

CREATE INDEX "game_lists_tournamentId_matchday_idx" ON "game_lists"("tournamentId", "matchday");
