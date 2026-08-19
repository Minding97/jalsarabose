import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const calendar = await readFile(new URL('../../src/app/calendar.tsx', import.meta.url), 'utf8');
const picker = await readFile(new URL('../../src/components/app/time-picker-field.tsx', import.meta.url), 'utf8');
const timeUtils = await readFile(new URL('../../src/utils/event-time.ts', import.meta.url), 'utf8');

test('calendar supports separate start/end times and an all-day option', () => {
  assert.match(calendar, /calendar-event-start-time-input/);
  assert.match(calendar, /calendar-event-end-time-input/);
  assert.match(calendar, /calendar-event-all-day-toggle/);
  assert.match(calendar, /종일 · 00:00–23:59/);
  assert.match(calendar, /isValidEventTimeRange/);
});

test('time picker provides 30-minute choices while retaining minute-level text input', () => {
  assert.match(picker, /Array\.from\(\{ length: 48 \}/);
  assert.match(picker, /onChangeText=\{onChange\}/);
  assert.match(picker, /maxLength=\{5\}/);
  assert.match(timeUtils, /2\[0-3\]/);
  assert.match(timeUtils, /end > start/);
});
