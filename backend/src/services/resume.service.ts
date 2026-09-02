import { getCloudinary } from "../utils/cloudinary.js";
import getDataUri from "../utils/datauri.js";
import { logger } from "../lib/logger.js";

/** How long a minted resume link stays usable. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Resumes are PII. They upload as `authenticated` raw assets, we persist only
 * the public_id, and every read mints a short-lived signed URL.
 *
 * The inherited flow stored Cloudinary's public `secure_url` — unguessable, but
 * valid forever for anyone who ever saw it, including a recruiter who viewed an
 * application once and a log that captured the response.
 */
export async function uploadResume(file: Express.Multer.File): Promise<{ storageKey: string }> {
  const upload = await getCloudinary().uploader.upload(getDataUri(file).content as string, {
    type: "authenticated",
    resource_type: "raw",
    folder: "resumes",
    // A data URI carries no filename, so Cloudinary would mint a bare,
    // extension-less id — and its download endpoint then answers
    // application/octet-stream with that gibberish id as the filename: the
    // right bytes, saved as a file no PDF reader recognises as a PDF. An
    // extensioned id makes the answer a real PDF.
    public_id: `${crypto.randomUUID()}.pdf`,
  });
  return { storageKey: upload.public_id };
}

export function signedResumeUrl(storageKey: string | null | undefined): string | null {
  if (!storageKey) return null;
  // Rows written before this change hold a full public URL, not a key. They stay
  // readable rather than breaking; new uploads all take the branch below.
  if (/^https:\/\/res\.cloudinary\.com\//i.test(storageKey)) return storageKey;
  return getCloudinary().utils.private_download_url(storageKey, "pdf", {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  });
}

/**
 * Best-effort cleanup of a replaced resume's asset — the upload and the save
 * have already succeeded by the time this runs, so a failure here is storage
 * growth, not data loss. Logged and swallowed rather than failing an update
 * that already happened.
 *
 * Call it only after the record's save commits: on a failed save the previous
 * key is still the referenced one, and destroying it would break the record
 * to tidy storage.
 */
export async function destroyResume(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  // Legacy rows hold full public URLs rather than keys — nothing to destroy
  // through this path, same branch `signedResumeUrl` takes.
  if (/^https:\/\//i.test(storageKey)) return;
  try {
    await getCloudinary().uploader.destroy(storageKey, {
      resource_type: "raw",
      type: "authenticated",
    });
  } catch (error) {
    logger.warn({ err: error }, "A replaced resume asset could not be destroyed");
  }
}
