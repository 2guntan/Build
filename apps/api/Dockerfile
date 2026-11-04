FROM node:22-slim
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @fs/api...
WORKDIR /repo/apps/api
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["pnpm", "start"]
