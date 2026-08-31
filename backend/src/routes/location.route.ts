import express from "express";

import { countryFromRequest, reverseGeocode } from "../services/location.service.js";
import { rateLimit } from "../middleware/rateLimit.js";

/**
 * The location reads — P2 of the location-aware phase.
 *
 * Both are unauthenticated on purpose: they answer questions a signed-out
 * visitor's browser asks ("which city am I in?") with data that is not
 * personal. The reverse lookup is rate-limited tightly because it is the one
 * that spends an external service's goodwill; the country read is a header
 * glance that could never be worth throttling.
 */
const router = express.Router();

const reverseLimit = rateLimit({ windowMs: 60_000, max: 10 });

router.get("/reverse", reverseLimit, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  // Number("") is 0 and Number("12abc") is NaN — both are wrong here, so the
  // range check does the rejecting rather than a separate type check.
  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lng) || lng < -180 || lng > 180
  ) {
    res
      .status(400)
      .json({ success: false, code: "VALIDATION_ERROR", message: "lat and lng must be numbers within range." });
    return;
  }
  const location = await reverseGeocode(lat, lng);
  res.status(200).json({ success: true, ...location });
});

router.get("/country", (req, res) => {
  const tz = typeof req.query.tz === "string" ? req.query.tz : null;
  res.status(200).json({ success: true, country: countryFromRequest(req.headers, tz) });
});

export default router;
