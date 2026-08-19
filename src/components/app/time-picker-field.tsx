import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { isValidEventTime } from '@/utils/event-time';

const HALF_HOUR_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2).toString().padStart(2, '0');
  const minutes = index % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

type TimePickerFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testID?: string;
};

export function TimePickerField({ label, value, onChange, disabled, testID }: TimePickerFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const invalid = Boolean(value) && !isValidEventTime(value);

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          accessibilityLabel={`${label} 직접 입력`}
          editable={!disabled}
          value={value}
          onChangeText={onChange}
          placeholder="00:00"
          placeholderTextColor={theme.textTertiary}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: invalid ? theme.danger : theme.border,
              color: theme.text,
              opacity: disabled ? 0.55 : 1,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 30분 단위 선택`}
          disabled={disabled}
          onPress={() => setOpen((current) => !current)}
          style={[styles.pickerButton, { backgroundColor: theme.primarySoft, opacity: disabled ? 0.55 : 1 }]}>
          <Text style={[styles.pickerButtonText, { color: theme.primary }]}>시간 선택</Text>
        </Pressable>
      </View>
      {invalid ? <Text style={[styles.error, { color: theme.danger }]}>HH:mm 형식으로 입력해 주세요.</Text> : null}
      {open && !disabled ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
          {HALF_HOUR_OPTIONS.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: option === value }}
              onPress={() => {
                onChange(option);
                setOpen(false);
              }}
              style={[
                styles.option,
                { backgroundColor: option === value ? theme.primary : theme.backgroundElement, borderColor: theme.border },
              ]}>
              <Text style={{ color: option === value ? '#FFFFFF' : theme.text }}>{option}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontWeight: '500' },
  pickerButton: { minHeight: 44, borderRadius: 10, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  pickerButtonText: { fontSize: 13, fontWeight: '700' },
  error: { fontSize: 12, lineHeight: 17 },
  options: { gap: 7, paddingVertical: 2 },
  option: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
});
