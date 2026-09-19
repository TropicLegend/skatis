FROM node:24.21.0-alpine

USER node
WORKDIR /home/node/app

COPY --chown=node:node . .

RUN npm install
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
