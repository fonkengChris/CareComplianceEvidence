import type { Request, Response } from 'express';
import * as photoService from '../services/day-entry-photo.service';

/**
 * Evidence-photo controllers: HTTP glue only (CLAUDE.md layering). The route's role +
 * assignment guards have already authorised the plan (`:id`); the service proves the
 * entry/photo belongs to that plan. Out-of-plan ids are 404 (never reveal existence).
 */

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await photoService.listPhotosForPlan(String(req.params.id)));
}

export async function upload(req: Request, res: Response): Promise<void> {
  // `express.raw` on the route leaves the image bytes in `req.body` as a Buffer.
  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0) {
    res.status(400).json({ error: 'A photo is required' });
    return;
  }
  const result = await photoService.addPhoto(
    String(req.params.id),
    String(req.params.entryId),
    data,
    req.user!.sub,
  );
  if (!result.ok) {
    if (result.reason === 'not_found') {
      res.status(404).json({ error: 'Day entry not found' });
    } else if (result.reason === 'unsupported_type') {
      res.status(415).json({ error: 'Unsupported image — use a JPEG, PNG or WebP photo' });
    } else {
      res.status(409).json({ error: 'This activity already has the maximum number of photos' });
    }
    return;
  }
  res.status(201).json(result.value);
}

export async function getImage(req: Request, res: Response): Promise<void> {
  const photo = await photoService.getPhotoData(String(req.params.id), String(req.params.photoId));
  if (!photo) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }
  // Personal data about a service user: never cache in shared or browser caches, and never
  // let the browser second-guess the (server-sniffed) type.
  res.set({
    'Content-Type': photo.contentType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(photo.data);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const result = await photoService.deletePhoto(
    String(req.params.id),
    String(req.params.photoId),
    req.user!,
  );
  if (!result.ok) {
    if (result.reason === 'not_found') {
      res.status(404).json({ error: 'Photo not found' });
    } else {
      res.status(403).json({ error: 'You can only remove photos you added' });
    }
    return;
  }
  res.status(204).end();
}
