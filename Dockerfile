FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

ENTRYPOINT ["npm", "run", "server"]
CMD []
