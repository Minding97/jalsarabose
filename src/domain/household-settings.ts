export const HOUSEHOLD_NAME_MIN_LENGTH = 2;
export const HOUSEHOLD_NAME_MAX_LENGTH = 30;

export function normalizeHouseholdName(name: string) {
  return name.trim();
}

export function validateHouseholdName(name: string): string | null {
  const normalizedName = normalizeHouseholdName(name);

  if (
    normalizedName.length < HOUSEHOLD_NAME_MIN_LENGTH ||
    normalizedName.length > HOUSEHOLD_NAME_MAX_LENGTH
  ) {
    return `가구 이름은 ${HOUSEHOLD_NAME_MIN_LENGTH}~${HOUSEHOLD_NAME_MAX_LENGTH}자로 입력해주세요.`;
  }

  return null;
}
