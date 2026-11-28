import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@anthropic-ai/sdk",
    "@react-pdf/renderer",
    "htmlparser2",
    "mammoth",
    "pdf-parse",
    "pdf2pic",
    "pg-boss",
    "tesseract.js",
  ],
};

export default nextConfig;
