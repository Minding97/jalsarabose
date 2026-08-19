import { ViewStyle } from 'react-native';

import { confirmFormReset } from '@/utils/form-reset';

import { ActionButton } from './action-button';

type FormResetButtonProps = {
  onReset: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function FormResetButton({
  onReset,
  disabled,
  style,
  testID,
}: FormResetButtonProps) {
  return (
    <ActionButton
      testID={testID}
      variant="secondary"
      onPress={() => confirmFormReset(onReset)}
      disabled={disabled}
      style={style}>
      초기화
    </ActionButton>
  );
}
