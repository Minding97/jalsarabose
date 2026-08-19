import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const calendarSource = readFileSync(resolve(repositoryRoot, 'src/app/calendar.tsx'), 'utf8');

test('calendar memo input uses a generic details prompt', () => {
  const memoInputStart = calendarSource.indexOf('testID="calendar-event-time-input"');
  const memoInputEnd = calendarSource.indexOf('/>', memoInputStart);

  assert.notEqual(memoInputStart, -1, 'calendar memo input should remain available');
  assert.notEqual(memoInputEnd, -1, 'calendar memo input should remain a TextInput');

  const memoInput = calendarSource.slice(memoInputStart, memoInputEnd);
  assert.match(memoInput, /accessibilityLabel="일정 상세 내용"/);
  assert.match(memoInput, /placeholder="상세 내용"/);
  assert.doesNotMatch(memoInput, /placeholder="시간/);
});
