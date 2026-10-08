# Baut das Frontend im Image selbst: `npm ci` nach Lockfile, dann `npm run build`.
# So kann kein veralteter `dist`-Ordner vom Build-Host hineingeraten – er wird
# hier nie kopiert, nur erzeugt.
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Optional eine andere API als die ausgelieferte (https://skatis.online/api):
#   docker build --build-arg VITE_API_BASE=https://example.org/api …
# Ohne Angabe darf die Variable nicht leer gesetzt sein – ein leerer Wert wäre
# die API-Adresse.
ARG VITE_API_BASE
RUN if [ -z "${VITE_API_BASE}" ]; then unset VITE_API_BASE; else export VITE_API_BASE; fi \
    && npm run build

# Nur das Ergebnis des Baus: `dist` enthält index.html und assets/.
FROM nginx:1.30-alpine

# Wohin die Seite Anfragen schicken darf (`connect-src` der Content-Security-Policy):
# die eigene Adresse und die ausgelieferte API. Wer mit `VITE_API_BASE` eine andere
# API einbaut, nennt sie hier beim Start – z. B. -e CSP_CONNECT_SRC="'self' https://example.org".
ENV CSP_CONNECT_SRC="'self' https://skatis.online"

# Antwort-Header (CSP, nosniff, Caching) – der Entrypoint des Images macht daraus
# /etc/nginx/conf.d/security-headers.conf.
COPY nginx/security-headers.conf.template /etc/nginx/templates/security-headers.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
