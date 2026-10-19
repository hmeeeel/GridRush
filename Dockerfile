FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1
CMD ["node", "server/index.js"]
