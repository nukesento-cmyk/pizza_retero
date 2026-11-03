/** Create the media bucket if missing. Idempotent. `pnpm --filter web storage:init` */
import path from "node:path";
import { config } from "dotenv";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const { S3_ENDPOINT, S3_REGION = "us-east-1", S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE } = process.env;
if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error("S3_* env vars missing");
const client = new S3Client({ region: S3_REGION, endpoint: S3_ENDPOINT, forcePathStyle: S3_FORCE_PATH_STYLE === "true", credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
for (let attempt = 1; ; attempt++) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    console.log(`bucket ${S3_BUCKET} ready`);
    break;
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) { await client.send(new CreateBucketCommand({ Bucket: S3_BUCKET })); console.log(`created bucket ${S3_BUCKET}`); break; }
    if (attempt >= 20) throw e;
    await new Promise((r) => setTimeout(r, 1500));
  }
}
