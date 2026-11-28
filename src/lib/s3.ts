import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const globalForS3 = globalThis as unknown as { s3?: S3Client };

export const s3 =
  globalForS3.s3 ??
  new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForS3.s3 = s3;
}

export const S3_BUCKET = process.env.S3_BUCKET ?? "";

export async function downloadBuffer(key: string): Promise<Buffer> {
  if (!S3_BUCKET) throw new Error("S3_BUCKET is not configured");

  const response = await s3.send(
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
  );
  if (!response.Body) throw new Error(`S3 object ${key} has no body`);

  return Buffer.from(await response.Body.transformToByteArray());
}
