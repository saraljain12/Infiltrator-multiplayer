FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npm run build
RUN npx prisma generate

EXPOSE 3001

CMD npx prisma migrate deploy && node dist/index.js
