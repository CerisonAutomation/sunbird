/**
 * Season identity helpers, dependency-free so SaveData can use them
 * without importing SeasonPass (which imports SaveData types — a cycle).
 */

export function seasonId(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function seasonLabel(id: string): string {
  const [y, m] = id.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[(m ?? 1) - 1]} ${y}`;
}
