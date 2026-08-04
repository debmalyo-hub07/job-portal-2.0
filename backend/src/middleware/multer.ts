import multer from "multer";
import { AppError } from "../lib/AppError.js";

const MAX_BYTES = 5 * 1024 * 1024;

function uploader(allowed: readonly string[]) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(AppError.badRequest("UNSUPPORTED_FILE_TYPE", `Expected one of: ${allowed.join(", ")}`));
    },
  }).single("file");
}

/** Seeker resumes: PDF only. */
export const resumeUpload = uploader(["application/pdf"]);
/** Company logos. */
export const logoUpload = uploader(["image/png", "image/jpeg", "image/webp"]);
