import { Bug, CircleStop, ClipboardList, Radio, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { SegmentedControl } from '@/components/app/segmented-control';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createQaReportId, isQaMode, submitQaReport } from '@/qa/client';
import { startQaRecording } from '@/qa/recorder';
import {
  QaRecordingArtifact,
  QaRecordingController,
  QaReportKind,
  QaReportMetadata,
  QaReportResponse,
} from '@/qa/types';

const MAX_RECORDING_MS = 5 * 60 * 1000;
const REPORTER_STORAGE_KEY = 'jalsarabose.qa.reporter';

type QaPhase = 'idle' | 'recording' | 'review' | 'submitting' | 'success';

export function QaOverlay() {
  const theme = useTheme();
  const recorderRef = useRef<QaRecordingController | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<QaPhase>('idle');
  const [kind, setKind] = useState<QaReportKind>('bug');
  const [memo, setMemo] = useState('');
  const [reporter, setReporter] = useState(() =>
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? (window.localStorage.getItem(REPORTER_STORAGE_KEY) ?? '')
      : '',
  );
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [recording, setRecording] = useState<QaRecordingArtifact | null>(null);
  const [stepCount, setStepCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<QaReportResponse | null>(null);

  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
      }
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
      }
    },
    [],
  );

  if (!isQaMode() || Platform.OS !== 'web') {
    return null;
  }

  const reset = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    setPhase('idle');
    setKind('bug');
    setMemo('');
    setRecordingEnabled(true);
    setRecording(null);
    setStepCount(0);
    setElapsedMs(0);
    setErrorMessage(null);
    setResult(null);
  };

  const close = () => {
    setVisible(false);
    reset();
  };

  const validate = () => {
    const trimmedReporter = reporter.trim();
    const trimmedMemo = memo.trim();

    if (trimmedReporter.length < 2 || trimmedReporter.length > 30) {
      setErrorMessage('제보자 이름은 2~30자로 입력해주세요.');
      return false;
    }
    if (trimmedMemo.length < 5 || trimmedMemo.length > 500) {
      setErrorMessage('메모는 5~500자로 입력해주세요.');
      return false;
    }

    window.localStorage.setItem(REPORTER_STORAGE_KEY, trimmedReporter);
    setErrorMessage(null);
    return true;
  };

  const stopRecording = () => {
    if (!recorderRef.current) {
      return;
    }

    const artifact = recorderRef.current.stop();
    recorderRef.current = null;
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    setRecording(artifact);
    setElapsedMs(artifact.durationMs);
    setStepCount(artifact.steps.length);
    setPhase('review');
    setVisible(true);
  };

  const cancelRecording = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    setRecording(null);
    setStepCount(0);
    setElapsedMs(0);
    setPhase('idle');
    setVisible(true);
  };

  const startRecording = () => {
    if (!validate()) {
      return;
    }

    const recordingStartedAt = Date.now();
    setVisible(false);
    setStepCount(0);
    setElapsedMs(0);
    setPhase('recording');
    recorderRef.current = startQaRecording(setStepCount, () => {
      stopRecording();
      setErrorMessage('Recording 크기가 5MiB에 가까워 자동으로 종료했어요.');
    });
    tickerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - recordingStartedAt);
    }, 1000);
    autoStopTimerRef.current = setTimeout(stopRecording, MAX_RECORDING_MS);
  };

  const submit = async () => {
    if (!validate()) {
      setVisible(true);
      return;
    }

    setPhase('submitting');
    setErrorMessage(null);

    const metadata: QaReportMetadata = {
      reportId: createQaReportId(),
      kind,
      memo: memo.trim(),
      reporter: reporter.trim(),
      path: window.location.pathname + window.location.search,
      userAgent: window.navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      appEnvironment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
      commitSha: process.env.EXPO_PUBLIC_COMMIT_SHA ?? 'local',
      createdAt: new Date().toISOString(),
      recordingIncluded: Boolean(recording),
      recordingStepCount: recording?.steps.length ?? 0,
      recordingDurationMs: recording?.durationMs ?? 0,
    };

    try {
      const response = await submitQaReport(metadata, recording);
      setResult(response);
      setPhase('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'QA 티켓을 생성하지 못했어요.');
      setPhase(recording ? 'review' : 'idle');
    }
  };

  const updateKind = (nextKind: QaReportKind) => {
    setKind(nextKind);
    setRecordingEnabled(nextKind === 'bug');
    setRecording(null);
    setErrorMessage(null);
  };

  return (
    <View style={styles.root}>
      <View style={styles.frame}>
        {phase === 'recording' ? (
          <View
            testID="qa-recording-toolbar"
            style={[styles.recordingToolbar, { backgroundColor: theme.text }]}>
            <View style={styles.recordingStatus}>
              <Radio size={16} color={theme.dangerSoft} />
              <View>
                <Text style={styles.recordingLabel}>Recording</Text>
                <Text style={styles.recordingMeta}>
                  {formatDuration(elapsedMs)} · {stepCount}단계
                </Text>
              </View>
            </View>
            <View style={styles.recordingActions}>
              <Pressable
                testID="qa-recording-cancel-button"
                accessibilityRole="button"
                accessibilityLabel="QA Recording 취소"
                onPress={cancelRecording}
                style={styles.stopButton}>
                <X size={19} color="#D8D5D0" />
              </Pressable>
              <Pressable
                testID="qa-recording-stop-button"
                accessibilityRole="button"
                accessibilityLabel="QA Recording 중지"
                onPress={stopRecording}
                style={styles.stopButton}>
                <CircleStop size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            testID="qa-report-open-button"
            accessibilityRole="button"
            accessibilityLabel="QA 이슈 제보"
            onPress={() => setVisible(true)}
            style={({ pressed }) => [
              styles.launcher,
              {
                backgroundColor: theme.text,
                opacity: pressed ? 0.72 : 1,
              },
            ]}>
            <Bug size={19} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
        )}
      </View>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable
            testID="qa-report-backdrop"
            accessibilityRole="button"
            accessibilityLabel="QA 제보 닫기"
            style={styles.backdrop}
            onPress={close}
          />
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <ClipboardList size={20} color={theme.text} />
                <Text style={[styles.title, { color: theme.text }]}>QA 제보</Text>
              </View>
              <Pressable
                testID="qa-report-close-button"
                accessibilityRole="button"
                accessibilityLabel="QA 제보 닫기"
                onPress={close}
                style={styles.iconButton}>
                <X size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {phase === 'success' && result ? (
              <View style={styles.successContent}>
                <Text style={[styles.successTitle, { color: theme.text }]}>접수됐어요</Text>
                <Text style={[styles.helper, { color: theme.textSecondary }]}>
                  {result.ticketKey} 티켓이 자동수정 대기에 추가됐어요.
                </Text>
                {result.attachmentWarning ? (
                  <Text style={[styles.error, { color: theme.warning }]}>
                    {result.attachmentWarning}
                  </Text>
                ) : null}
                <ActionButton
                  testID="qa-ticket-open-button"
                  onPress={() => void Linking.openURL(result.ticketUrl)}>
                  Jira 티켓 보기
                </ActionButton>
                <ActionButton testID="qa-report-done-button" variant="secondary" onPress={close}>
                  닫기
                </ActionButton>
              </View>
            ) : (
              <View style={styles.form}>
                <SegmentedControl
                  testID="qa-report-kind-control"
                  accessibilityLabel="QA 제보 유형"
                  value={kind}
                  onChange={updateKind}
                  options={[
                    { label: '버그', value: 'bug' },
                    { label: 'Task', value: 'task' },
                  ]}
                />

                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>제보자</Text>
                  <TextInput
                    testID="qa-reporter-input"
                    accessibilityLabel="QA 제보자"
                    value={reporter}
                    onChangeText={(value) => {
                      setReporter(value);
                      setErrorMessage(null);
                    }}
                    placeholder="이름"
                    placeholderTextColor={theme.textTertiary}
                    style={[
                      styles.input,
                      {
                        color: theme.text,
                        borderColor: theme.border,
                        backgroundColor: theme.backgroundElement,
                      },
                    ]}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>간단한 메모</Text>
                  <TextInput
                    testID="qa-memo-input"
                    accessibilityLabel="QA 제보 메모"
                    value={memo}
                    onChangeText={(value) => {
                      setMemo(value);
                      setErrorMessage(null);
                    }}
                    placeholder={
                      kind === 'bug' ? '예: 초대 코드를 입력해도 이동하지 않음' : '예: 지출에 검색 추가'
                    }
                    placeholderTextColor={theme.textTertiary}
                    multiline
                    maxLength={500}
                    textAlignVertical="top"
                    style={[
                      styles.input,
                      styles.memoInput,
                      {
                        color: theme.text,
                        borderColor: theme.border,
                        backgroundColor: theme.backgroundElement,
                      },
                    ]}
                  />
                  <Text style={[styles.counter, { color: theme.textTertiary }]}>
                    {memo.length}/500
                  </Text>
                </View>

                {recording ? (
                  <View
                    style={[
                      styles.recordingSummary,
                      { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                    ]}>
                    <Text style={[styles.summaryTitle, { color: theme.text }]}>
                      Recording 준비 완료
                    </Text>
                    <Text style={[styles.helper, { color: theme.textSecondary }]}>
                      {formatDuration(recording.durationMs)} · {recording.steps.length}단계
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    testID="qa-recording-toggle"
                    accessibilityRole="checkbox"
                    accessibilityLabel="Recording 사용"
                    accessibilityState={{ checked: recordingEnabled }}
                    onPress={() => setRecordingEnabled((value) => !value)}
                    style={styles.recordingOption}>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: recordingEnabled ? theme.primary : theme.border,
                          backgroundColor: recordingEnabled ? theme.primary : theme.backgroundElement,
                        },
                      ]}>
                      {recordingEnabled ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <View style={styles.recordingOptionText}>
                      <Text style={[styles.summaryTitle, { color: theme.text }]}>Recording 사용</Text>
                      <Text style={[styles.helper, { color: theme.textSecondary }]}>
                        입력값과 화면 조작을 QA 재현용으로 기록해요.
                      </Text>
                    </View>
                  </Pressable>
                )}

                {errorMessage ? (
                  <Text style={[styles.error, { color: theme.danger }]}>{errorMessage}</Text>
                ) : null}

                {recording ? (
                  <View style={styles.actions}>
                    <ActionButton
                      testID="qa-recording-retry-button"
                      variant="secondary"
                      onPress={() => {
                        setRecording(null);
                        setPhase('idle');
                      }}
                      disabled={phase === 'submitting'}
                      style={styles.action}>
                      다시 기록
                    </ActionButton>
                    <ActionButton
                      testID="qa-report-submit-button"
                      onPress={() => void submit()}
                      disabled={phase === 'submitting'}
                      style={styles.action}>
                      {phase === 'submitting' ? '생성 중' : '티켓 생성'}
                    </ActionButton>
                  </View>
                ) : recordingEnabled ? (
                  <ActionButton testID="qa-recording-start-button" onPress={startRecording}>
                    Recording 시작
                  </ActionButton>
                ) : (
                  <ActionButton
                    testID="qa-report-submit-button"
                    onPress={() => void submit()}
                    disabled={phase === 'submitting'}>
                    {phase === 'submitting' ? '생성 중' : '티켓 생성'}
                  </ActionButton>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  frame: {
    width: '100%',
    maxWidth: MaxContentWidth,
    height: '100%',
    alignSelf: 'center',
    pointerEvents: 'box-none',
  },
  launcher: {
    position: 'absolute',
    top: 64,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.18)',
  },
  recordingToolbar: {
    position: 'absolute',
    top: 12,
    right: 12,
    left: 12,
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 3px 9px rgba(0, 0, 0, 0.20)',
  },
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  recordingMeta: {
    color: '#D8D5D0',
    fontSize: 11,
    fontWeight: '600',
  },
  stopButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backdrop: {
    flex: 1,
    width: '100%',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '800',
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  memoInput: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
  },
  counter: {
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '500',
  },
  recordingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  recordingOptionText: {
    flex: 1,
    gap: 2,
  },
  recordingSummary: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 3,
  },
  summaryTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  error: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
  },
  successContent: {
    gap: 14,
    paddingBottom: 4,
  },
  successTitle: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '800',
  },
});
