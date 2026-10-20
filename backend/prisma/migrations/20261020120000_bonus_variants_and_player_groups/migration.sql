CREATE TYPE "OpponentBonusVariant" AS ENUM ('OFFICIAL', 'MATHEMATICAL');

ALTER TABLE "tournaments"
ADD COLUMN "opponentBonusVariant" "OpponentBonusVariant" NOT NULL DEFAULT 'OFFICIAL';

CREATE TABLE "player_groups" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "player_group_memberships" (
    "groupId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "player_group_memberships_pkey" PRIMARY KEY ("groupId", "playerId")
);

CREATE UNIQUE INDEX "player_groups_tournamentId_name_key" ON "player_groups"("tournamentId", "name");
CREATE INDEX "player_group_memberships_playerId_idx" ON "player_group_memberships"("playerId");

ALTER TABLE "player_groups" ADD CONSTRAINT "player_groups_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_group_memberships" ADD CONSTRAINT "player_group_memberships_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "player_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "player_group_memberships" ADD CONSTRAINT "player_group_memberships_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;