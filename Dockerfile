FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/yooshinn2024/coffee_cupping"
LABEL org.opencontainers.image.description="A Little Coffee (珈琲の小時間 / 咖啡小记录) - Daily Brew & SCA Cupping Web App"
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
COPY package.json ./
COPY server ./server
COPY public ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Starts as root, sets ownership of /app/data to PUID:PGID, and drops privileges
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
