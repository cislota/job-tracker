FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs career.mjs letter-generator.mjs ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=4318 DB_PATH=/app/data/tracker.sqlite
EXPOSE 4318
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
