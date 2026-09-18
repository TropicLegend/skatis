-- CreateEnum
CREATE TYPE "ListStatus" AS ENUM ('OPEN', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('KARO', 'HERZ', 'PIK', 'KREUZ', 'GRAND', 'NULL');

-- CreateEnum
CREATE TYPE "Matadors" AS ENUM ('WITH', 'WITHOUT');

-- CreateTable
CREATE TABLE "tournaments" (
    "id" VARCHAR(12) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "matchdays" INTEGER[],
    "adminPasswordHash" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_lists" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchday" DATE NOT NULL,
    "status" "ListStatus" NOT NULL DEFAULT 'OPEN',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_list_players" (
    "listId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "game_list_players_pkey" PRIMARY KEY ("listId","playerId")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "players" TEXT[],
    "dealer" TEXT NOT NULL,
    "declarer" TEXT,
    "gameType" "GameType",
    "hand" BOOLEAN NOT NULL DEFAULT false,
    "schneiderAnnounced" BOOLEAN NOT NULL DEFAULT false,
    "schwarzAnnounced" BOOLEAN NOT NULL DEFAULT false,
    "offen" BOOLEAN NOT NULL DEFAULT false,
    "matadors" "Matadors",
    "matadorsCount" INTEGER,
    "schneider" BOOLEAN NOT NULL DEFAULT false,
    "schwarz" BOOLEAN NOT NULL DEFAULT false,
    "won" BOOLEAN,
    "gameValue" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournaments_name_idx" ON "tournaments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "players_tournamentId_name_key" ON "players"("tournamentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "game_lists_tournamentId_matchday_key" ON "game_lists"("tournamentId", "matchday");

-- CreateIndex
CREATE INDEX "game_list_players_playerId_idx" ON "game_list_players"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "game_list_players_listId_position_key" ON "game_list_players"("listId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "games_listId_position_key" ON "games"("listId", "position");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_lists" ADD CONSTRAINT "game_lists_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_players" ADD CONSTRAINT "game_list_players_listId_fkey" FOREIGN KEY ("listId") REFERENCES "game_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_list_players" ADD CONSTRAINT "game_list_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_listId_fkey" FOREIGN KEY ("listId") REFERENCES "game_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
