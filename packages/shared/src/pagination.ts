import { z } from "zod";

/**
 * `limit` clamps rather than rejects: an over-eager client gets 50 rows
 * instead of a 400. `page` still rejects below 1, since a 0 or negative page
 * is a client bug worth surfacing rather than silently reinterpreting.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).catch(50).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};
