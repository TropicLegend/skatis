-- A rename left the Geber of the games behind: `dealer` is a copy of a name of
-- the lineup and used to be the only name column that was not rewritten when a
-- player was renamed (see `renamePlayer`). The seating order is stored and the
-- Geber follows it – the player at position 1 deals in round 1, then position 2
-- and so on –, so the stale names can be restored from the lineup without
-- knowing whose name they were. Games that are already consistent keep their
-- value, the update only touches rows whose Geber does not match the round.
--
-- A side effect of the stale name was that `nextDealer` could not find the
-- previous Geber in the lineup and restarted the order with player 1; repairing
-- the value also repairs the Geber order of any round entered afterwards.
WITH "lineup" AS (
  SELECT l."id" AS "list_id",
         array_agg(p."name" ORDER BY lp."position") AS "names",
         count(*)::int AS "seats"
  FROM "game_lists" l
  JOIN "game_list_players" lp ON lp."listId" = l."id"
  JOIN "players" p ON p."id" = lp."playerId"
  GROUP BY l."id"
)
UPDATE "games" g
SET "dealer" = "lineup"."names"[((g."position" - 1) % "lineup"."seats") + 1]
FROM "lineup"
WHERE g."listId" = "lineup"."list_id"
  AND g."dealer" IS DISTINCT FROM "lineup"."names"[((g."position" - 1) % "lineup"."seats") + 1];
