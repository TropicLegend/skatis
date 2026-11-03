ALTER TABLE "player_groups" ADD COLUMN "rank" INTEGER NOT NULL DEFAULT 1;

WITH ranked_groups AS (
    SELECT "id",
           ROW_NUMBER() OVER (PARTITION BY "tournamentId" ORDER BY "createdAt", "name", "id") AS "rank"
    FROM "player_groups"
)
UPDATE "player_groups" AS groups
SET "rank" = ranked_groups."rank"
FROM ranked_groups
WHERE groups."id" = ranked_groups."id";

WITH ranked_memberships AS (
    SELECT memberships."groupId",
           memberships."playerId",
           ROW_NUMBER() OVER (
               PARTITION BY memberships."playerId"
               ORDER BY groups."createdAt", groups."name", memberships."groupId"
           ) AS membership_rank
    FROM "player_group_memberships" AS memberships
    JOIN "player_groups" AS groups ON groups."id" = memberships."groupId"
)
DELETE FROM "player_group_memberships" AS memberships
USING ranked_memberships
WHERE memberships."groupId" = ranked_memberships."groupId"
  AND memberships."playerId" = ranked_memberships."playerId"
  AND ranked_memberships.membership_rank > 1;

CREATE UNIQUE INDEX "player_group_memberships_playerId_key"
ON "player_group_memberships"("playerId");

ALTER TABLE "game_lists"
ADD COLUMN "table_label" VARCHAR(2) NOT NULL DEFAULT 'A';

WITH ranked_lists AS (
    SELECT "id",
           ROW_NUMBER() OVER (
               PARTITION BY "tournamentId", "matchday", "series", "table_number"
               ORDER BY "createdAt", "id"
           ) AS slot_rank
    FROM "game_lists"
)
UPDATE "game_lists" AS lists
SET "table_label" = CASE
    WHEN ranked_lists.slot_rank <= 26 THEN CHR(64 + ranked_lists.slot_rank::INTEGER)
    ELSE CHR(64 + ((ranked_lists.slot_rank - 1) / 26)::INTEGER)
         || CHR(65 + ((ranked_lists.slot_rank - 1) % 26)::INTEGER)
END
FROM ranked_lists
WHERE lists."id" = ranked_lists."id";

CREATE UNIQUE INDEX "game_lists_slot_label_key"
ON "game_lists"("tournamentId", "matchday", "series", "table_number", "table_label");