import { getCloudinary } from "../utils/cloudinary.js";
import getDataUri from "../utils/datauri.js";

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
  });
  return { storageKey: upload.public_id };
}

export function signedResumeUrl(storageKey: string | null | undefined): string | null {
  if (!storageKey) return null;
  // Rows written before this change hold a full public URL, not a key. They stay
  // readable rather than breaking; new uploads all take the branch below.
  if (storageKey.startsWith("http")) return storageKey;
  return getCloudinary().utils.private_download_url(storageKey, "pdf", {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  });
}
