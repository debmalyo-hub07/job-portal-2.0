import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

let configured = false;

/**
 * Configured on first use, not at import time.
 *
 * A module-scope `env()` call forces full config validation whenever this file
 * is imported — including from a test that never touches Cloudinary but pulls
 * it in transitively via the company controller, before the harness has set the
 * environment. Same trap as lib/logger.ts, handled differently: the logger
 * reads NODE_ENV directly because it needs a value at import time; this only
 * needs one when an upload actually happens.
 */
export function getCloudinary(): typeof cloudinary {
  if (!configured) {
    const config = env();
    cloudinary.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
    });
    configured = true;
  }
  return cloudinary;
}
