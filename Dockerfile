FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      tini \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --chown=node:node . .
RUN mkdir -p Matsuri_translation/frontend/cache \
    && chown -R node:node Matsuri_translation/frontend/cache

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8082 \
    CHROMIUM_PATH=/usr/bin/chromium

USER node
EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8082/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["tini", "--"]
CMD ["node", "src/index.mjs"]
