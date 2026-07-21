'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Avatar } from '@/app/_components/Avatar';

/**
 * Profile-picture upload (CO-6). The heavy lifting happens client-side: the
 * chosen image is centre-cropped to a square and downscaled to 256px on a
 * canvas, so the server only ever receives a small webp/jpeg — no image
 * processing dependency on the backend, and no multi-megabyte uploads.
 */

/** Output edge length — plenty for a 28px chip rendered at 2–3x DPR. */
const AVATAR_EDGE = 256;

/** Downscale + centre-crop a chosen file to a square webp blob. */
async function toSquareWebp(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (bitmap === null) return null;
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_EDGE;
  canvas.height = AVATAR_EDGE;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/webp');
  });
}

export function AvatarUploader({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string | null;
}): React.JSX.Element {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const blob = await toSquareWebp(file);
      if (blob === null) {
        setError('Could not read that image — try a different file.');
        return;
      }
      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'content-type': blob.type },
        body: blob,
      });
      if (!response.ok) {
        setError('Upload failed. Please try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error while uploading.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/profile/avatar', { method: 'DELETE' });
      if (!response.ok) {
        setError('Could not remove the picture. Please try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error while removing.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="avatar-uploader">
      <Avatar url={avatarUrl} name={displayName ?? '?'} size={64} />
      <div className="avatar-uploader__controls">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file !== undefined) void upload(file);
          }}
        />
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Working…' : avatarUrl === null ? 'Add a picture' : 'Change picture'}
        </button>
        {avatarUrl !== null ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => void remove()}
          >
            Remove
          </button>
        ) : null}
        <p className="meta avatar-uploader__hint">
          Square works best — we crop the centre and shrink it for you.
        </p>
        {error !== null ? (
          <p className="text-danger" role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
