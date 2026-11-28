FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ghostscript \
    graphicsmagick \
    imagemagick \
    tesseract-ocr \
    tesseract-ocr-deu \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec prisma generate \
  && SKIP_ENV_VALIDATION=1 pnpm build

EXPOSE 3000
ENTRYPOINT ["pnpm"]
CMD ["start"]
