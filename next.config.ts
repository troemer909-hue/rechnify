import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@anthropic-ai/sdk",
    "htmlparser2",
    "mammoth",
    "pdf-parse",
    "pdf2pic",
    "pg-boss",
    "sanitize-html",
    "tesseract.js",
  ],
};

export default nextConfig;
