import { GetObjectCommand, S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";

const allowedContentTypes = new Set(["text/csv", "text/plain", "application/vnd.ms-excel", "application/ofx", "application/x-ofx", "application/qfx", "application/pdf", "image/jpeg", "image/png", "image/webp"]);

function getR2Client() {
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    throw new AppError(503, "Cloudflare R2 is not configured.", "R2_NOT_CONFIGURED");
  }
  return {
    client: new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    }),
    bucket: env.R2_BUCKET_NAME,
  };
}

export async function getPrivateObjectText(objectKey: string) {
  const { client, bucket } = getR2Client();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (!response.Body) throw new AppError(502, "The uploaded file could not be read from storage.", "R2_OBJECT_UNAVAILABLE");
  return response.Body.transformToString();
}

export async function getPrivateObjectBytes(objectKey: string) {
  const { client, bucket } = getR2Client();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (!response.Body) throw new AppError(502, "The uploaded file could not be read from storage.", "R2_OBJECT_UNAVAILABLE");
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function storePrivateObject(objectKey: string, contentType: string, body: Uint8Array) {
  if (!allowedContentTypes.has(contentType)) {
    throw new AppError(400, "Unsupported upload type.", "UNSUPPORTED_FILE_TYPE");
  }
  const { client, bucket } = getR2Client();
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType, Body: body }));
  } catch (error) {
    const code = error instanceof Error && "Code" in error ? String((error as { Code?: string }).Code) : "";
    if (code === "AccessDenied" || code === "SignatureDoesNotMatch") {
      throw new AppError(502, "Cloudflare R2 rejected the upload. Check that the S3 API token has Object Read & Write access to this bucket and that the endpoint, bucket, access key, and secret belong to the same R2 account.", "R2_UPLOAD_FORBIDDEN");
    }
    throw error;
  }
}

export async function createUploadUrl(objectKey: string, contentType: string) {
  if (!allowedContentTypes.has(contentType)) {
    throw new AppError(400, "Only CSV or plain-text uploads are supported.", "UNSUPPORTED_FILE_TYPE");
  }
  const { client, bucket } = getR2Client();
  const command = new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: 900 });
}
