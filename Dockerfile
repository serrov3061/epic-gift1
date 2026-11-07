FROM node:22-slim

# инструменты сборки для better-sqlite3 (на случай, если нет готового бинарника)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/data.db
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "src/server.js"]
