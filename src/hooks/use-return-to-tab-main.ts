import { useFocusEffect } from 'expo-router';
import { Dispatch, SetStateAction, useCallback } from 'react';

export function useReturnToTabMain(setSubviewVisible: Dispatch<SetStateAction<boolean>>) {
  useFocusEffect(
    useCallback(
      () => () => {
        setSubviewVisible(false);
      },
      [setSubviewVisible],
    ),
  );
}
