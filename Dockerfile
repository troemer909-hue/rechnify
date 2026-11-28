FROM node:22-bookworm-slim

ARG MUSTANG_VERSION=2.26.0
ENV MUSTANG_CLI_JAR=/opt/mustang/Mustang-CLI-${MUSTANG_VERSION}.jar
ENV JAVA_BINARY=java
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl libreoffice-writer openjdk-21-jre-headless \
  && mkdir -p /opt/mustang \
  && curl -fsSL "https://github.com/ZUGFeRD/mustangproject/releases/download/core-${MUSTANG_VERSION}/Mustang-CLI-${MUSTANG_VERSION}.jar" -o "$MUSTANG_CLI_JAR" \
  && apt-get purge -y --auto-remove curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN DATABASE_URL=postgresql://rechnify:build@localhost:5432/rechnify pnpm prisma generate \
  && DATABASE_URL=postgresql://rechnify:build@localhost:5432/rechnify SKIP_ENV_VALIDATION=1 pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
