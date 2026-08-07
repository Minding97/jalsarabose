export function normalizeSplitRatio(
  splitRatio: Record<string, number> | undefined,
  memberIds: string[],
): Record<string, number> | undefined {
  if (!splitRatio) {
    return undefined;
  }

  const values = memberIds.map((memberId) => Math.max(splitRatio[memberId] ?? 0, 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return Object.fromEntries(memberIds.map((memberId) => [memberId, 0]));
  }

  const normalized = values.map((value) => Math.round((value / total) * 10000) / 100);
  const difference =
    Math.round((100 - normalized.reduce((sum, value) => sum + value, 0)) * 100) / 100;
  const adjustmentIndex = normalized.findLastIndex((value) => value > 0);
  if (adjustmentIndex >= 0) {
    normalized[adjustmentIndex] =
      Math.round((normalized[adjustmentIndex] + difference) * 100) / 100;
  }

  return Object.fromEntries(memberIds.map((memberId, index) => [memberId, normalized[index]]));
}
