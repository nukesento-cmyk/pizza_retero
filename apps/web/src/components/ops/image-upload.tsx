"use client";

import { useRef, useState } from "react";
import { confirmProductImage, presignProductImage } from "@/app/ops/catalogue-actions";

/**
 * Direct-to-bucket upload: ask the server for a presigned POST (size and type
 * enforced by the policy), upload, then ask the server to verify and attach.
 */
export function ProductImageUpload({ productId, current }: { productId: string; current: string | null }) {
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setStatus("Uploading…");
    const p = await presignProductImage(productId, file.type);
    if (!p.ok) return setStatus(p.message);
    const fd = new FormData();
    for (const [k, v] of Object.entries(p.fields)) fd.append(k, v);
    fd.append("file", file);
    const up = await fetch(p.url, { method: "POST", body: fd });
    if (!up.ok) return setStatus(up.status === 400 ? "That file is too large (max 5 MB)." : "Upload failed.");
    const res = await confirmProductImage(productId, p.key);
    if (!res?.ok) return setStatus(res?.message ?? "Couldn't verify the upload.");
    setPreview(`/media/${p.key}`);
    setStatus("Photo saved.");
  }

  return (
    <div className="flex items-start gap-4">
      <div className="grid size-32 place-items-center overflow-hidden rounded-lg border bg-muted text-center text-xs text-muted-foreground">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by /media */}
        {preview ? <img src={preview} alt="Product photo" className="size-full object-cover" /> : "No photo yet"}
      </div>
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Real photography of this product. JPEG, PNG, WebP or AVIF, up to 5 MB.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Product photo"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="text-sm" />
        {status ? <p aria-live="polite" className="text-xs">{status}</p> : null}
      </div>
    </div>
  );
}
