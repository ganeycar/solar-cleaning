"use client";

import { useState, type InputHTMLAttributes } from "react";

/**
 * File input that shrinks photos in the browser (longest side ~1600px, JPEG)
 * before the form is sent. Phone photos are 3–8 MB; hosting limits a request to
 * about 4.5 MB, and smaller files upload faster on a cell connection.
 * If the browser can't process an image, the original is kept.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.82;

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export function PhotoInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [busy, setBusy] = useState(false);
  return (
    <span className="block">
      <input
        {...props}
        type="file"
        onChange={async (e) => {
          const input = e.currentTarget as HTMLInputElement;
          const files = Array.from(input.files ?? []);
          if (files.length === 0 || typeof DataTransfer === "undefined") return;
          setBusy(true);
          const form = input.form;
          const submits = form ? Array.from(form.querySelectorAll<HTMLButtonElement>("button[type=submit],button:not([type])")) : [];
          submits.forEach((b) => (b.disabled = true));
          try {
            const out = await Promise.all(files.map(shrink));
            const dt = new DataTransfer();
            out.forEach((f) => dt.items.add(f));
            input.files = dt.files;
          } finally {
            submits.forEach((b) => (b.disabled = false));
            setBusy(false);
          }
        }}
      />
      {busy && <span role="status" className="mt-1 block text-xs text-muted">Preparing photos…</span>}
    </span>
  );
}
