export type HouseholdSnapshotSource =
  | 'household'
  | 'members'
  | 'monthlyBudgets'
  | 'expenses'
  | 'fridgeItems'
  | 'notes'
  | 'noteComments';

const coreSources: ReadonlySet<HouseholdSnapshotSource> = new Set([
  'household',
  'members',
  'monthlyBudgets',
  'expenses',
  'fridgeItems',
]);

export function createHouseholdSnapshotGate(
  onReady: () => void,
  onError: (error: Error) => void,
) {
  const initializedCoreSources = new Set<HouseholdSnapshotSource>();

  const coreIsReady = () =>
    [...coreSources].every((source) => initializedCoreSources.has(source));

  return {
    sourceLoaded(source: HouseholdSnapshotSource) {
      if (coreSources.has(source)) {
        initializedCoreSources.add(source);
      }

      if (coreIsReady()) {
        onReady();
      }
    },
    sourceFailed(source: HouseholdSnapshotSource, error: Error) {
      if (coreSources.has(source)) {
        onError(error);
      }
    },
  };
}
