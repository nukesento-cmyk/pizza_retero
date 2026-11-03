import { readPublicObject } from "@/server/storage";

/**
 * Public brand media (product photos, 3D assets). Keys are server-generated
 * UUIDs, so content is immutable and cached for a year. Only keys matching the
 * brands/{brand}/{kind}/{owner}/{uuid}.{ext} shape are served.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const obj = await readPublicObject(key.map(decodeURIComponent).join("/"));
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body as ReadableStream, {
    headers: {
      "content-type": obj.type,
      ...(obj.length ? { "content-length": String(obj.length) } : {}),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
