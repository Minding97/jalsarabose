import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const calendarSource = readFileSync(resolve(repositoryRoot, 'src/app/calendar.tsx'), 'utf8');

test('calendar memo input uses a generic details prompt', () => {
  const memoInputStart = calendarSource.indexOf('testID="calendar-event-details-input"');
  const memoInputEnd = calendarSource.indexOf('/>', memoInputStart);

  assert.notEqual(memoInputStart, -1, 'calendar memo input should remain available');
  assert.notEqual(memoInputEnd, -1, 'calendar memo input should remain a TextInput');

  const memoInput = calendarSource.slice(memoInputStart, memoInputEnd);
  assert.match(memoInput, /accessibilityLabel="일정 상세 내용"/);
  assert.match(memoInput, /placeholder="상세 내용"/);
  assert.match(memoInput, /value=\{newDetails\}/);
  assert.match(memoInput, /onChangeText=\{setNewDetails\}/);
  assert.doesNotMatch(memoInput, /placeholder="시간/);
});

test('calendar stores and displays memo values as optional details', () => {
  assert.match(calendarSource, /type LocalEvent = \{[\s\S]*?details: string;/);
  assert.match(calendarSource, /details: newDetails\.trim\(\),/);
  assert.match(
    calendarSource,
    /\{event\.details \? \([\s\S]*?styles\.eventDetails[\s\S]*?\{event\.details\}[\s\S]*?\) : null\}/,
  );

  assert.doesNotMatch(calendarSource, /calendar-event-time-input/);
  assert.doesNotMatch(calendarSource, /\bnewTime\b|\bsetNewTime\b/);
  assert.doesNotMatch(calendarSource, /\btime: new|event\.time|styles\.eventTime/);
  assert.doesNotMatch(calendarSource, /종일/);
});
