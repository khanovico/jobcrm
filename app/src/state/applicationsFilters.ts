const state = {
  selectedAppliedProfileNames: null as string[] | null
};

const toUnique = (values: string[]) => Array.from(new Set(values));

export const getSelectedAppliedProfileNames = () => state.selectedAppliedProfileNames;

export const initializeSelectedAppliedProfileNames = (availableNames: string[]) => {
  const uniqueAvailable = toUnique(availableNames);
  if (state.selectedAppliedProfileNames === null) {
    if (uniqueAvailable.length === 0) {
      return [];
    }
    state.selectedAppliedProfileNames = uniqueAvailable;
    return state.selectedAppliedProfileNames;
  }
  const availableSet = new Set(uniqueAvailable);
  state.selectedAppliedProfileNames = state.selectedAppliedProfileNames.filter((name) => availableSet.has(name));
  return state.selectedAppliedProfileNames;
};

export const setSelectedAppliedProfileNames = (selectedNames: string[]) => {
  state.selectedAppliedProfileNames = toUnique(selectedNames);
};

export const resetAppliedProfilesFilterSelectionForTests = () => {
  state.selectedAppliedProfileNames = null;
};
