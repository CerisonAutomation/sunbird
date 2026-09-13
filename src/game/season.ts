/**
 * Season identity helpers — decoupled from SeasonPass so tests can import
 * without pulling in the full pass implementation.
 */

export function seasonId(date = new Date()): string {
  // Local calendar month, matching monthKey/weekBounds gameplay windows.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function seasonLabel(id: string): string {
  const [year, month] = id.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}
