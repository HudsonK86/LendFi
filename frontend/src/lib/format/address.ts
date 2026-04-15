export function shortAddress(value: string | null | undefined, missingLabel = "—"): string {
  if (!value) return missingLabel;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
