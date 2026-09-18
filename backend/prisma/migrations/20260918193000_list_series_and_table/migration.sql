-- The head of a sheet carries "Datum, Serie und Tisch", so a list has to know
-- its series and its table. Existing rows get the values of a single-table,
-- single-series tournament and lose the default afterwards, so a client has to
-- send them from now on.
ALTER TABLE "game_lists" ADD COLUMN "series" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "game_lists" ADD COLUMN "table_number" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "game_lists" ALTER COLUMN "series" DROP DEFAULT;
ALTER TABLE "game_lists" ALTER COLUMN "table_number" DROP DEFAULT;

-- A table of a series is unique per evening. Several lists still share a
-- matchday; they only have to differ in series or table.
CREATE UNIQUE INDEX "game_lists_matchday_series_table_key" ON "game_lists"("tournamentId", "matchday", "series", "table_number");
