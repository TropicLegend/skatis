# Baut das Frontend im Image selbst: `npm ci` nach Lockfile, dann `npm run build`.
# So kann kein veralteter `dist`-Ordner vom Build-Host hineingeraten – er wird
# hier nie kopiert, nur erzeugt.
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Nur das Ergebnis des Baus: `dist` enthält index.html und assets/.
FROM nginx
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
