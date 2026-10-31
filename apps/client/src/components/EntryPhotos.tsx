import type { DayEntryPhoto } from '@care/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deletePhoto, fetchPhotoBlob, prepareImage, uploadPhoto } from '../lib/day-entry-photos';
import { toErrorMessage } from '../lib/errors';
import { Button } from './ui/button';

/**
 * Evidence photos for one recorded activity on the staff recording screen: thumbnails of
 * what's attached, plus "Take photo" (opens the rear camera on phones) and "Upload" (gallery
 * / file picker). Each photo uploads as soon as it's picked — independent of the card's
 * Save — and is downscaled + stripped of EXIF in the browser first. Staff may remove only
 * photos they added; managers may remove any (the server enforces both).
 */

type EntryPhotosProps = {
  planId: string;
  entryId: string;
  photos: DayEntryPhoto[];
  /** Accessible name of the activity, e.g. "Shopping". */
  label: string;
  currentUserId: string | undefined;
  canRemoveAny: boolean;
};

/** Load a photo's bytes (bearer-authed) into an object URL, revoked when no longer shown. */
function usePhotoUrl(planId: string, photoId: string): string | null {
  const blob = useQuery({
    queryKey: ['week-plans', planId, 'photos', photoId],
    queryFn: () => fetchPhotoBlob(planId, photoId),
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!(blob.data instanceof Blob) || typeof URL.createObjectURL !== 'function') return;
    const next = URL.createObjectURL(blob.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob.data]);
  return url;
}

function PhotoThumb({
  planId,
  photo,
  index,
  label,
  removable,
  onRemove,
  removing,
}: {
  planId: string;
  photo: DayEntryPhoto;
  index: number;
  label: string;
  removable: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const url = usePhotoUrl(planId, photo.id);
  const [open, setOpen] = useState(false);
  const name = `Photo ${index + 1} for ${label}`;

  return (
    <li className="relative size-20 overflow-hidden rounded-md border border-border bg-muted">
      <button
        type="button"
        aria-label={`View ${name}`}
        onClick={() => setOpen(true)}
        disabled={!url}
        className="size-full"
      >
        {url ? (
          <img src={url} alt={name} className="size-full object-cover" />
        ) : (
          <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
        )}
      </button>
      {removable && (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          disabled={removing}
          className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
        >
          <X className="size-3" />
        </button>
      )}
      {open && url && (
        <div
          role="dialog"
          aria-label={name}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <img src={url} alt={name} className="max-h-full max-w-full rounded-md" />
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </li>
  );
}

export default function EntryPhotos({
  planId,
  entryId,
  photos,
  label,
  currentUserId,
  canRemoveAny,
}: EntryPhotosProps) {
  const queryClient = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['week-plans', planId, 'photos'] });

  const upload = useMutation({
    mutationFn: async (file: File) => uploadPhoto(planId, entryId, await prepareImage(file)),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (photoId: string) => deletePhoto(planId, photoId),
    onSuccess: refresh,
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires a change.
    e.target.value = '';
    if (file) upload.mutate(file);
  };

  const error = upload.error ?? remove.error;

  return (
    <div className="flex flex-col gap-2">
      {photos.length > 0 && (
        <ul aria-label={`Photos for ${label}`} className="flex flex-wrap gap-2">
          {photos.map((photo, i) => (
            <PhotoThumb
              key={photo.id}
              planId={planId}
              photo={photo}
              index={i}
              label={label}
              removable={canRemoveAny || photo.uploadedById === currentUserId}
              onRemove={() => remove.mutate(photo.id)}
              removing={remove.isPending}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraRef.current?.click()}
          disabled={upload.isPending}
          aria-label={`Take photo for ${label}`}
        >
          <Camera className="size-4" />
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          aria-label={`Upload photo for ${label}`}
        >
          <ImagePlus className="size-4" />
          Upload
        </Button>
        {upload.isPending && (
          <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Uploading…
          </span>
        )}
        {/* `capture` opens the rear camera on phones; desktops fall back to a file picker. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-testid={`camera-input-${entryId}`}
          onChange={onPick}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          hidden
          data-testid={`file-input-${entryId}`}
          onChange={onPick}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {toErrorMessage(error)}
        </p>
      )}
    </div>
  );
}
