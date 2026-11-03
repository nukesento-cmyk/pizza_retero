import "server-only";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { z } from "zod";
import { loadEnv } from "@retero/shared/env";
import { AppError } from "@retero/shared/errors";
import { uuidv7 } from "@retero/shared/ids";

/**
 * S3-compatible storage (SeaweedFS locally; S3 / Supabase Storage in prod).
 * Uploads go browser → bucket via presigned POST with size + type
 * conditions; the server then verifies the object (size, type, magic bytes)
 * before referencing it. Keys are server-generated and tenant-prefixed.
 */
const storageEnv = z.object({
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
});

let cached: { client: S3Client; env: z.infer<typeof storageEnv> } | undefined;
function s3() {
  if (!cached) {
    const env = loadEnv(storageEnv);
    cached = {
      env,
      client: new S3Client({
        region: env.S3_REGION, endpoint: env.S3_ENDPOINT, forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      }),
    };
  }
  return cached;
}

export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as const;
export type ImageType = keyof typeof IMAGE_TYPES;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function presignImageUpload(prefix: string, contentType: string) {
  if (!(contentType in IMAGE_TYPES)) throw new AppError("VALIDATION_FAILED", "Upload a JPEG, PNG, WebP or AVIF image.");
  const { client, env } = s3();
  const key = `${prefix}/${uuidv7()}.${IMAGE_TYPES[contentType as ImageType]}`;
  const post = await createPresignedPost(client, {
    Bucket: env.S3_BUCKET, Key: key, Expires: 300,
    Conditions: [["content-length-range", 1, MAX_IMAGE_BYTES], ["eq", "$Content-Type", contentType]],
    Fields: { "Content-Type": contentType },
  });
  return { key, url: post.url, fields: post.fields };
}

const MAGIC: Record<ImageType, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  "image/avif": (b) => String.fromCharCode(...b.slice(4, 12)).startsWith("ftypavi"),
};

/** Confirm an uploaded object is what it claims to be, under the expected prefix. */
export async function verifyImage(key: string, expectedPrefix: string) {
  if (!key.startsWith(`${expectedPrefix}/`) || key.includes("..")) throw new AppError("FORBIDDEN", "That file doesn't belong here.");
  const { client, env } = s3();
  let head;
  try {
    head = await client.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch {
    throw new AppError("VALIDATION_FAILED", "Upload not found. Try again.");
  }
  const type = head.ContentType as ImageType;
  if (!(type in IMAGE_TYPES) || !head.ContentLength || head.ContentLength > MAX_IMAGE_BYTES) {
    throw new AppError("VALIDATION_FAILED", "That file isn't an allowed image.");
  }
  const obj = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Range: "bytes=0-15" }));
  const bytes = new Uint8Array(await obj.Body!.transformToByteArray());
  if (!MAGIC[type](bytes)) throw new AppError("VALIDATION_FAILED", "The file contents don't match its type.");
  return { key, bytes: head.ContentLength, type };
}

/** Public URL for a brand asset, served via /media (bucket stays private). */
export function publicUrl(key: string | null | undefined): string | null {
  if (!key || !key.startsWith("brands/")) return null;
  return `/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Stream a public brand asset. Only the brands/ prefix is ever served. */
export async function readPublicObject(key: string) {
  if (!/^brands\/[0-9a-f-]{36}\/[a-z0-9-]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif|glb|ktx2)$/.test(key)) return null;
  const { client, env } = s3();
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return { body: obj.Body!.transformToWebStream(), type: obj.ContentType ?? "application/octet-stream", length: obj.ContentLength };
  } catch {
    return null;
  }
}
