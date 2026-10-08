# Zwei Stufen: die erste baut (`npm ci` nach Lockfile, dann `tsc`), die zweite
# enthält nur, was zum Laufen gebraucht wird – ohne Compiler, Linter und Tests.
FROM node:24.21.0-alpine AS build
WORKDIR /app

# Erst die Manifeste: solange sie sich nicht ändern, bleibt die Installation im
# Cache. `prisma/` muss schon da sein – `postinstall` ruft `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build


FROM node:24.21.0-alpine

# `production` gilt auch, wenn die Umgebung nichts setzt; `TZ` entscheidet, wann
# ein Spieltag endet (siehe README) – beides lässt sich beim Start überschreiben.
ENV NODE_ENV=production \
    TZ=Europe/Berlin

WORKDIR /home/node/app
RUN chown node:node /home/node/app
USER node

# Nur die Laufzeit-Abhängigkeiten, exakt nach Lockfile. `prisma version` holt die
# Engines schon beim Bauen, damit `prisma migrate deploy` beim Start nichts mehr
# aus dem Netz laden muss.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
RUN npm ci --omit=dev \
    && npx prisma version > /dev/null \
    && npm cache clean --force

COPY --chown=node:node --from=build /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

# `node` direkt statt `npm start`: so kommt SIGTERM beim Prozess an und der Server
# fährt geordnet herunter.
CMD ["node", "dist/server.js"]
