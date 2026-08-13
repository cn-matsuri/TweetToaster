FROM mcr.microsoft.com/playwright:v1.62.0-noble

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --chown=pwuser:pwuser . .
RUN mkdir -p Matsuri_translation/frontend/cache && chown -R pwuser:pwuser Matsuri_translation/frontend/cache

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8082 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER pwuser
EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8082/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/index.mjs"]
