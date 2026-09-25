/**
 * Sunbird social backend — entrypoint.
 *
 *   node --import tsx server/src/index.ts        # dev
 *   pnpm --dir server start                      # dev (tsx watch)
 *
 * Env: see server/src/config.ts (SUNBIRD_*).
 */
import { createApp } from "./server.js";

async function main(): Promise<void> {
  const app = createApp();
  const port = await app.listen();
  console.log(`sunbird-social listening on ${app.ctx.cfg.host}:${port}`);
  console.log(`  REST   http://localhost:${port}/mp/v1/…   (identity, friends, rooms, boards, ghosts, squads, tournaments, saves, moderation)`);
  console.log(`  WS     ws://localhost:${port}/mp/v1/rooms/ws?token=…`);
  console.log(`  legacy ws://localhost:${port}/mp?device=…&room=…`);

  const shutdown = async (signal: string) => {
    console.log(`${signal} — shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("sunbird-social failed to start:", err);
  process.exit(1);
});
