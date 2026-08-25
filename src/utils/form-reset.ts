import { Alert, Platform } from 'react-native';

export const FORM_RESET_CONFIRMATION = '초기화 하시겠습니까?';

export function confirmFormReset(onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm(FORM_RESET_CONFIRMATION)) {
      onConfirm();
    }
    return;
  }

  Alert.alert('초기화', FORM_RESET_CONFIRMATION, [
    { text: '취소', style: 'cancel' },
    { text: '초기화', style: 'destructive', onPress: onConfirm },
  ]);
}
