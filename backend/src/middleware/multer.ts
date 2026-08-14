import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { AppError } from "../lib/AppError.js";

const MAX_BYTES = 5 * 1024 * 1024;

function uploader(allowed: readonly string[]) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(AppError.badRequest("UNSUPPORTED_FILE_TYPE", `Expected one of: ${allowed.join(", ")}`));
    },
  }).single("file");

  return function validatedUpload(req: Request, res: Response, next: NextFunction): void {
    parser(req, res, (error: unknown) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          next(new AppError(413, "FILE_TOO_LARGE", "Uploaded files must be 5 MB or smaller."));
          return;
        }
        if (error instanceof multer.MulterError) {
          next(AppError.badRequest("INVALID_UPLOAD", "The upload could not be processed."));
          return;
        }
        next(error);
        return;
      }

      void validateFile(req).then(next).catch(next);
    });
  };
}

async function validateFile(req: Request): Promise<void> {
  const file = req.file;
  if (!file) return;

  let detected;
  try {
    detected = await fileTypeFromBuffer(file.buffer);
  } catch {
    detected = undefined;
  }

  if (!detected || detected.mime !== file.mimetype) {
    throw AppError.badRequest(
      "UNSUPPORTED_FILE_TYPE",
      "The file contents do not match the declared file type.",
    );
  }

  // The original name is presentation data only. Strip path/control content
  // before it is persisted or returned in a DTO.
  file.originalname = file.originalname
    .split(/[\\/]/)
    .pop()!
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .slice(0, 255);
}

/** Seeker resumes: PDF only. */
export const resumeUpload = uploader(["application/pdf"]);
/** Company logos. */
export const logoUpload = uploader(["image/png", "image/jpeg", "image/webp"]);
