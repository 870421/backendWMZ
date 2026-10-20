# Imagen de producción del backend. Incluye sequelize-cli para aplicar las migraciones y los
# scripts de import, que se lanzan con `docker compose run --rm backend ...` (ver deploy/README.md).
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY .sequelizerc ./
COPY src ./src

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
