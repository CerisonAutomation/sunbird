import { z } from "zod";

/** Runtime boundary schemas. Never trust localStorage, network, or portal data. */
export const SaveEnvelopeSchema = z.object({
  v: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()),
  checksum: z.string().optional(),
}).passthrough();

export const RealtimeFrameSchema = z.object({
  type: z.string().min(1),
  version: z.number().int().nonnegative().optional(),
  payload: z.unknown().optional(),
}).passthrough();

export const LeaderboardEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number().finite(),
  distance: z.number().finite().optional(),
  score: z.number().finite().optional(),
}).passthrough();

export const LeaderboardResponseSchema = z.object({
  entries: z.array(LeaderboardEntrySchema),
  yourRank: z.number().int().positive().nullable().optional(),
  total: z.number().int().nonnegative().optional(),
}).passthrough();

export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;
export type RealtimeFrame = z.infer<typeof RealtimeFrameSchema>;
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

export function safeParse<T>(schema: z.ZodType<T>, input: unknown): T | null {
  const result = schema.safeParse(input);
  return result.success ? result.data : null;
}
