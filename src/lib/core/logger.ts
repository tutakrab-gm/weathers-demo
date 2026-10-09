const warned = new Set<string>();
export function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[water-watch] ${msg}`);
}
export const log = (...a: unknown[]) => console.log("[water-watch]", ...a);
