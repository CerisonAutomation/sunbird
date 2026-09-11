import type { SkinDef } from "./Economy";

export type ShareCard = { blob: Blob | null; dataUrl: string; text: string };

/** Draws a shareable "flight card" summarizing a run onto a canvas. */
export async function buildShareCard(opts: {
  distance: number;
  coins: number;
  score: number;
  skin: SkinDef;
  referralCode: string;
  seedLabel: string;
}): Promise<ShareCard> {
  const w = 1000;
  const h = 620;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#5eb7ea");
  sky.addColorStop(0.55, "#ffd9a0");
  sky.addColorStop(1, "#ff9a6a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const [cx, cy, r] of [[160, 120, 40], [230, 140, 30], [780, 90, 46], [850, 120, 30]] as const) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#2f7d5b";
  ctx.beginPath();
  ctx.moveTo(0, 430);
  for (let x = 0; x <= w; x += 20) {
    ctx.lineTo(x, 430 + Math.sin(x * 0.012) * 30 + Math.cos(x * 0.006) * 18);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = `#${opts.skin.body.toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.ellipse(190, 340, 46, 36, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `#${opts.skin.belly.toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.ellipse(200, 352, 26, 18, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `#${opts.skin.wing.toString(16).padStart(6, "0")}`;
  ctx.beginPath();
  ctx.ellipse(160, 330, 28, 12, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(20,16,30,0.28)";
  roundRect(ctx, 40, 40, 620, 150, 22);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "700 46px Fredoka, sans-serif";
  ctx.fillText("SUNBIRD", 64, 100);
  ctx.font = "500 20px Fredoka, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(opts.seedLabel, 64, 132);
  ctx.fillText(`Bird: ${opts.skin.name}`, 64, 160);

  ctx.fillStyle = "rgba(20,16,30,0.35)";
  roundRect(ctx, 40, 210, 620, 180, 22);
  ctx.fill();
  ctx.fillStyle = "#fff";
  const stat = (label: string, value: string, x: number): void => {
    ctx.font = "600 16px Fredoka, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(label.toUpperCase(), x, 250);
    ctx.font = "700 40px Fredoka, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(value, x, 300);
  };
  stat("Distance", `${Math.floor(opts.distance)} m`, 64);
  stat("Coins", String(opts.coins), 300);
  stat("Score", Math.floor(opts.score).toLocaleString(), 470);
  ctx.font = "500 16px Fredoka, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(`Play free · friend code ${opts.referralCode}`, 64, 368);

  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  const text = `I flew ${Math.floor(opts.distance)}m in Sunbird 🌤️ Use my code ${opts.referralCode} for a bonus!`;
  return { blob, dataUrl, text };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function shareOrDownload(
  card: ShareCard,
  filename = "sunbird-flight.png",
  allowDownload = true,
): Promise<"shared" | "downloaded" | "copied"> {
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data: ShareData) => boolean;
  };
  if (nav.share && card.blob) {
    const file = new File([card.blob], filename, { type: "image/png" });
    const data: ShareData = { files: [file], text: card.text, title: "Sunbird" };
    if (!nav.canShare || nav.canShare(data)) {
      try {
        await nav.share(data);
        return "shared";
      } catch {
        /* user cancelled or unsupported, fall through */
      }
    }
  }
  try {
    await navigator.clipboard.writeText(card.text);
  } catch {
    /* ignore */
  }
  // Portal iframes: triggering file downloads is flagged by QA — the copied
  // text is the share. Web builds still save the image card.
  if (!allowDownload) return "copied";
  const a = document.createElement("a");
  a.href = card.dataUrl;
  a.download = filename;
  a.click();
  return "downloaded";
}
