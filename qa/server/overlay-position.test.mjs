import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const overlaySource = readFileSync(new URL('../../src/components/qa-overlay.tsx', import.meta.url), 'utf8');
const tabsSource = readFileSync(new URL('../../src/components/app-tabs.tsx', import.meta.url), 'utf8');
const themeSource = readFileSync(new URL('../../src/constants/theme.ts', import.meta.url), 'utf8');

test('keeps the 40px QA launcher above the web tab bar at the content frame left edge', () => {
  assert.match(themeSource, /export const WebBottomTabHeight = 78;/);
  assert.match(tabsSource, /height: Platform\.OS === 'web' \? WebBottomTabHeight : 72/);
  assert.match(overlaySource, /left: 12,/);
  assert.match(
    overlaySource,
    /bottom: `calc\(\$\{WebBottomTabHeight \+ 12\}px \+ env\(safe-area-inset-bottom, 0px\)\)` as unknown as number/,
  );
  assert.match(overlaySource, /width: 40,\s+height: 40,/);
  assert.match(overlaySource, /accessibilityLabel="QA 이슈 제보"/);
  assert.match(overlaySource, /onPress=\{\(\) => setVisible\(true\)\}/);
});
