import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronLeft, MessageCircle, Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { EmptyState } from '@/components/app/empty-state';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { SegmentedControl } from '@/components/app/segmented-control';
import {
  getCommentPreview,
  getCommentsForNote,
  sortHouseholdNotes,
  validateHouseholdNoteInput,
  validateNoteComment,
} from '@/domain/household-notes';
import type {
  HouseholdNote,
  HouseholdNoteComment,
  HouseholdNoteType,
} from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';

export default function NotesScreen() {
  const theme = useTheme();
  const notes = useHouseholdStore((state) => state.notes);
  const comments = useHouseholdStore((state) => state.noteComments);
  const members = useHouseholdStore((state) => state.members);
  const currentUser = useHouseholdStore((state) => state.currentUser);
  const addNoteItem = useHouseholdStore((state) => state.addNoteItem);
  const updateNoteItem = useHouseholdStore((state) => state.updateNoteItem);
  const updateNoteStatus = useHouseholdStore((state) => state.updateNoteStatus);
  const deleteNoteItem = useHouseholdStore((state) => state.deleteNoteItem);
  const clearCompletedShoppingItems = useHouseholdStore(
    (state) => state.clearCompletedShoppingItems,
  );
  const addNoteComment = useHouseholdStore((state) => state.addNoteComment);
  const deleteNoteComment = useHouseholdStore((state) => state.deleteNoteComment);
  const [view, setView] = useState<HouseholdNoteType>('memo');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<HouseholdNoteType>('memo');
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const visibleNotes = useMemo(
    () => sortHouseholdNotes(notes.filter((note) => note.type === view)),
    [notes, view],
  );
  const activeNotes = visibleNotes.filter((note) => note.status === 'active');
  const completedNotes = visibleNotes.filter((note) => note.status === 'completed');
  const selectedNote = notes.find((note) => note.id === selectedId);
  const selectedComments = selectedNote
    ? getCommentsForNote(selectedNote.id, comments)
    : [];
  const currentMember = members.find(
    (member) =>
      member.id === currentUser?.uid ||
      member.userId === currentUser?.uid ||
      member.name === currentUser?.displayName,
  );

  const memberName = (uid: string) => {
    const member = members.find((item) => item.id === uid || item.userId === uid);
    if (member) return member.name;
    if (currentUser?.uid === uid) return currentUser.displayName || '나';
    return '구성원';
  };

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setTitle('');
    setMemo('');
    setError(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormType(view);
    setFormOpen(true);
  };

  const openEditForm = (note: HouseholdNote) => {
    setEditingId(note.id);
    setFormType(note.type);
    setTitle(note.title);
    setMemo(note.memo ?? '');
    setError(null);
    setFormOpen(true);
  };

  const submitNote = async () => {
    const input = { type: formType, title, memo: memo.trim() || undefined };
    const validationMessage = validateHouseholdNoteInput(input);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) await updateNoteItem(editingId, input);
      else await addNoteItem(input);
      setView(formType);
      resetForm();
    } catch (caught) {
      setError(getMessage(caught, '메모를 저장하지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeNote = (note: HouseholdNote) => {
    confirmDestructive('삭제할까요?', '메모와 댓글이 함께 삭제돼요.', () => {
      setSubmitting(true);
      setError(null);
      void deleteNoteItem(note.id)
        .then(() => {
          setSelectedId(null);
          resetForm();
        })
        .catch((caught) => setError(getMessage(caught, '메모를 삭제하지 못했어요.')))
        .finally(() => setSubmitting(false));
    });
  };

  const toggleCompleted = async (note: HouseholdNote) => {
    try {
      await updateNoteStatus(note.id, note.status === 'completed' ? 'active' : 'completed');
    } catch (caught) {
      setError(getMessage(caught, '완료 상태를 바꾸지 못했어요.'));
    }
  };

  const submitComment = async () => {
    if (!selectedNote) return;
    const validationMessage = validateNoteComment(comment);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addNoteComment(selectedNote.id, comment);
      setComment('');
    } catch (caught) {
      setError(getMessage(caught, '댓글을 저장하지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeComment = async (commentItem: HouseholdNoteComment) => {
    setSubmitting(true);
    setError(null);
    try {
      await deleteNoteComment(commentItem.id);
    } catch (caught) {
      setError(getMessage(caught, '댓글을 삭제하지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (formOpen) {
    return (
      <Screen testID="note-form-screen">
        <HeaderBack
          title={editingId ? '메모 수정' : '새 메모'}
          onBack={resetForm}
          color={theme.textSecondary}
          textColor={theme.text}
        />
        <SegmentedControl
          value={formType}
          options={noteTypeOptions}
          onChange={setFormType}
          accessibilityLabel="메모 종류"
          testID="note-type-control"
        />
        <FormField
          label={formType === 'shopping' ? '항목명' : '메모 제목'}
          value={title}
          onChangeText={setTitle}
          placeholder={formType === 'shopping' ? '예: 세탁세제' : '예: 공동현관 안내'}
          testID="note-title-input"
        />
        <FormField
          label="간단 메모 (선택)"
          value={memo}
          onChangeText={setMemo}
          placeholder="함께 기억할 내용을 적어주세요"
          testID="note-memo-input"
        />
        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <View style={styles.actions}>
          {editingId ? (
            <ActionButton
              variant="danger"
              disabled={submitting}
              onPress={() => {
                const note = notes.find((item) => item.id === editingId);
                if (note) removeNote(note);
              }}
              style={styles.sideAction}>
              삭제
            </ActionButton>
          ) : null}
          <ActionButton
            testID="note-submit-button"
            disabled={submitting || !title.trim()}
            onPress={submitNote}
            style={styles.mainAction}>
            저장
          </ActionButton>
        </View>
      </Screen>
    );
  }

  if (selectedNote) {
    return (
      <Screen testID="note-detail-screen">
        <HeaderBack
          title={selectedNote.type === 'shopping' ? '살 것 상세' : '메모 상세'}
          onBack={() => {
            setSelectedId(null);
            setComment('');
            setError(null);
          }}
          color={theme.textSecondary}
          textColor={theme.text}
        />
        <Card>
          <View style={styles.noteHeader}>
            {selectedNote.type === 'shopping' ? (
              <CompletionButton note={selectedNote} onPress={() => toggleCompleted(selectedNote)} />
            ) : null}
            <View style={styles.noteText}>
              <Text
                style={[
                  styles.noteTitle,
                  {
                    color: theme.text,
                    textDecorationLine:
                      selectedNote.status === 'completed' ? 'line-through' : 'none',
                  },
                ]}>
                {selectedNote.title}
              </Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {memberName(selectedNote.createdBy)} · {formatTime(selectedNote.createdAt)}
              </Text>
            </View>
          </View>
          {selectedNote.memo ? (
            <Text style={[styles.memo, { color: theme.textSecondary }]}>{selectedNote.memo}</Text>
          ) : null}
          <View style={styles.actions}>
            <ActionButton
              variant="secondary"
              onPress={() => openEditForm(selectedNote)}
              style={styles.mainAction}>
              수정
            </ActionButton>
            <ActionButton
              variant="danger"
              disabled={submitting}
              onPress={() => removeNote(selectedNote)}
              style={styles.sideAction}>
              삭제
            </ActionButton>
          </View>
        </Card>

        <View style={styles.sectionHeading}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>댓글</Text>
          <Text style={[styles.commentCount, { color: theme.textSecondary }]}>
            {selectedComments.length}개
          </Text>
        </View>
        {selectedComments.length === 0 ? (
          <EmptyState title="아직 댓글이 없어요." description="첫 댓글을 남겨보세요." />
        ) : (
          selectedComments.map((commentItem) => {
            const canDelete =
              commentItem.createdBy === currentUser?.uid || currentMember?.role === 'admin';
            return (
              <CommentRow
                key={commentItem.id}
                comment={commentItem}
                author={memberName(commentItem.createdBy)}
                canDelete={canDelete}
                onDelete={() => removeComment(commentItem)}
              />
            );
          })
        )}
        <FormField
          label="댓글 작성"
          value={comment}
          onChangeText={setComment}
          placeholder="댓글을 입력해주세요"
          testID="note-comment-input"
        />
        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <ActionButton
          testID="note-comment-submit-button"
          disabled={submitting || !comment.trim()}
          onPress={submitComment}>
          댓글 등록
        </ActionButton>
      </Screen>
    );
  }

  return (
    <Screen
      title="우리집"
      description="생활 메모와 살 것을 둘이 함께 관리해요."
      testID="notes-screen"
      floatingAction={<FloatingButton onPress={openNewForm} />}>
      <SegmentedControl
        value={view}
        options={noteTypeOptions}
        onChange={setView}
        accessibilityLabel="우리집 메모 보기"
      />
      {activeNotes.length === 0 ? (
        <EmptyState
          title={view === 'shopping' ? '살 것이 없어요.' : '공유 메모가 없어요.'}
          description="오른쪽 아래 + 버튼으로 추가해보세요."
        />
      ) : (
        activeNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            comments={comments}
            memberName={memberName}
            onOpen={() => setSelectedId(note.id)}
            onToggle={() => toggleCompleted(note)}
          />
        ))
      )}
      {view === 'shopping' && completedNotes.length > 0 ? (
        <View style={styles.completedSection}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>완료한 항목</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="완료 항목 정리"
              onPress={() => {
                confirmDestructive(
                  '완료 항목을 정리할까요?',
                  `${completedNotes.length}개 항목이 삭제돼요.`,
                  () =>
                    void clearCompletedShoppingItems().catch((caught) =>
                      setError(getMessage(caught, '완료 항목을 정리하지 못했어요.')),
                    ),
                );
              }}>
              <Text style={[styles.clearLabel, { color: theme.danger }]}>모두 정리</Text>
            </Pressable>
          </View>
          {completedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              comments={comments}
              memberName={memberName}
              onOpen={() => setSelectedId(note.id)}
              onToggle={() => toggleCompleted(note)}
            />
          ))}
        </View>
      ) : null}
      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
    </Screen>
  );
}

function NoteCard({
  note,
  comments,
  memberName,
  onOpen,
  onToggle,
}: {
  note: HouseholdNote;
  comments: HouseholdNoteComment[];
  memberName: (uid: string) => string;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const preview = getCommentPreview(note.id, comments);
  const count = getCommentsForNote(note.id, comments).length;
  return (
    <Pressable accessibilityRole="button" onPress={onOpen}>
      <Card style={note.status === 'completed' ? styles.completedCard : undefined}>
        <View style={styles.noteHeader}>
          {note.type === 'shopping' ? <CompletionButton note={note} onPress={onToggle} /> : null}
          <View style={styles.noteText}>
            <Text
              style={[
                styles.noteTitle,
                {
                  color: theme.text,
                  textDecorationLine: note.status === 'completed' ? 'line-through' : 'none',
                },
              ]}>
              {note.title}
            </Text>
            {note.memo ? (
              <Text numberOfLines={2} style={[styles.memo, { color: theme.textSecondary }]}>
                {note.memo}
              </Text>
            ) : null}
          </View>
        </View>
        {preview.map((comment) => (
          <View key={comment.id} style={[styles.preview, { backgroundColor: theme.chip }]}>
            <Text style={[styles.previewAuthor, { color: theme.text }]}>
              {memberName(comment.createdBy)}
            </Text>
            <Text numberOfLines={1} style={[styles.previewText, { color: theme.textSecondary }]}>
              {comment.content}
            </Text>
          </View>
        ))}
        <View style={styles.cardFooter}>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>{formatTime(note.updatedAt)}</Text>
          <View style={styles.commentMeta}>
            <MessageCircle size={14} color={theme.textSecondary} />
            <Text style={[styles.meta, { color: theme.textSecondary }]}>{count}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function CompletionButton({ note, onPress }: { note: HouseholdNote; onPress: () => void }) {
  const theme = useTheme();
  const completed = note.status === 'completed';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${note.title} ${completed ? '완료 취소' : '완료'}`}
      accessibilityState={{ checked: completed }}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={[
        styles.checkbox,
        {
          borderColor: completed ? theme.primary : theme.border,
          backgroundColor: completed ? theme.primary : theme.backgroundElement,
        },
      ]}>
      {completed ? <Check size={14} color={theme.backgroundElement} strokeWidth={3} /> : null}
    </Pressable>
  );
}

function CommentRow({
  comment,
  author,
  canDelete,
  onDelete,
}: {
  comment: HouseholdNoteComment;
  author: string;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.commentRow, { borderColor: theme.border }]}>
      <View style={styles.commentBody}>
        <Text style={[styles.previewAuthor, { color: theme.text }]}>{author}</Text>
        <Text style={[styles.commentText, { color: theme.text }]}>{comment.content}</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>{formatTime(comment.createdAt)}</Text>
      </View>
      {canDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel="댓글 삭제" onPress={onDelete}>
          <Trash2 size={17} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function HeaderBack({
  title,
  onBack,
  color,
  textColor,
}: {
  title: string;
  onBack: () => void;
  color: string;
  textColor: string;
}) {
  return (
    <View style={styles.formHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack}>
        <ChevronLeft size={22} color={color} />
      </Pressable>
      <Text style={[styles.formTitle, { color: textColor }]}>{title}</Text>
    </View>
  );
}

function FloatingButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID="note-add-button"
      accessibilityRole="button"
      accessibilityLabel="메모 추가"
      onPress={onPress}
      style={[styles.floatingButton, { backgroundColor: theme.primary }]}>
      <Plus size={24} color={theme.backgroundElement} strokeWidth={2.5} />
    </Pressable>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function confirmDestructive(title: string, message: string, action: () => void) {
  if (Platform.OS === 'web') {
    action();
    return;
  }
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: action },
  ]);
}

const noteTypeOptions = [
  { value: 'memo' as const, label: '메모' },
  { value: 'shopping' as const, label: '살 것' },
];

const styles = StyleSheet.create({
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formTitle: { fontSize: 20, lineHeight: 28, fontWeight: '800' },
  noteHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  noteText: { flex: 1, gap: 4 },
  noteTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  memo: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  meta: { fontSize: 11, lineHeight: 16, fontWeight: '500' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { flexDirection: 'row', gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  previewAuthor: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  previewText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  completedCard: { opacity: 0.68 },
  completedSection: { gap: 12, marginTop: 8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  commentCount: { fontSize: 12, fontWeight: '600' },
  clearLabel: { fontSize: 12, fontWeight: '700' },
  commentRow: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, paddingVertical: 10 },
  commentBody: { flex: 1, gap: 3 },
  commentText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 8 },
  mainAction: { flex: 1 },
  sideAction: { minWidth: 84 },
  error: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  floatingButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
