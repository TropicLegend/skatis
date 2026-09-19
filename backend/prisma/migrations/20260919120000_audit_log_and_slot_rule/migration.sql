-- A table used to be reserved for the whole evening: "Serie 1, Tisch 3" of a
-- date could exist only once. Now it is only reserved while its first list is
-- still open – once the sheet is submitted (or its day is over) the table is
-- free for the next series. The rule is checked by the service
-- (`createList` in src/modules/lists/list.service.ts).
DROP INDEX "game_lists_matchday_series_table_key";

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "role" "ActorRole" NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_tournamentId_createdAt_idx" ON "audit_logs"("tournamentId", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
