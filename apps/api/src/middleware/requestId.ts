import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  // An inbound header is honoured so a trace survives across a proxy, but it is
  // length-capped: an unbounded client-controlled value lands in every log line.
  const inbound = req.header("x-request-id");
  req.requestId = inbound && inbound.length <= 64 ? inbound : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
