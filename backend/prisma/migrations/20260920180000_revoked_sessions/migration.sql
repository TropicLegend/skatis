-- Beendete Sitzungen ("Abmelden"). Tokens sind sonst zustandslos und bis zum
-- Ablauf gueltig; ein Logout muss also gemerkt werden, bis das Token ohnehin
-- abgelaufen waere. `id` ist die `jti`-Angabe des Tokens.
CREATE TABLE "revoked_sessions" (
    "id" TEXT NOT NULL,
    "tournamentId" VARCHAR(12) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_sessions_pkey" PRIMARY KEY ("id")
);

-- Abgelaufene Eintraege werden beim naechsten Logout geloescht.
CREATE INDEX "revoked_sessions_expiresAt_idx" ON "revoked_sessions"("expiresAt");

ALTER TABLE "revoked_sessions" ADD CONSTRAINT "revoked_sessions_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
