FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
COPY package.json ./
COPY server ./server
COPY public ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# 以 root 启动 → 把 data 目录交给 PUID/PGID 后自动降权运行
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
