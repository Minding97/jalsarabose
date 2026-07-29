function escapeAttribute(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function cssSegment(element: Element) {
  const tagName = element.tagName.toLowerCase();
  const parent = element.parentElement;

  if (!parent) {
    return tagName;
  }

  const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
  const index = siblings.indexOf(element) + 1;
  return siblings.length > 1 ? `${tagName}:nth-of-type(${index})` : tagName;
}

export function isQaControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-testid^="qa-"]'));
}

export function getQaSelector(target: EventTarget | null): {
  selector?: string;
  label?: string;
} {
  if (!(target instanceof Element)) {
    return {};
  }

  const element =
    target.closest('[data-testid], [aria-label], button, input, textarea, select, [role]') ?? target;
  const testId = element.getAttribute('data-testid');

  if (testId) {
    return {
      selector: `[data-testid="${escapeAttribute(testId)}"]`,
      label: testId,
    };
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return {
      selector: `[aria-label="${escapeAttribute(ariaLabel)}"]`,
      label: ariaLabel,
    };
  }

  const role = element.getAttribute('role');
  const text = element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80);

  if (role && text) {
    return {
      selector: `role=${role}|name=${JSON.stringify(text)}`,
      label: text,
    };
  }

  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && segments.length < 5) {
    segments.unshift(cssSegment(current));
    current = current.parentElement;
  }

  return {
    selector: segments.length > 0 ? segments.join(' > ') : undefined,
    label: text,
  };
}
