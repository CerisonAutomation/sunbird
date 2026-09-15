# Sunbird social backend (server/src — identity, friends, rooms, boards,
# ghosts, squads, tournaments, saves, moderation).
#
#   docker build -t sunbird-social:latest -f server/Dockerfile .
#
# The TypeScript server is self-contained: Node builtins + `ws`, loaded
# through tsx. Versions are pinned to the root package.json.

FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install --omit=dev --no-audit --no-fund tsx@4.23.13 ws@8.21.3
COPY server/src ./src
# 8791 = the port the dev vite proxy and the compose file expect.
ENV PORT=8791 HOST=0.0.0.0
EXPOSE 8791
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8791/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["sh", "-c", "exec node --import tsx src/index.ts"]
