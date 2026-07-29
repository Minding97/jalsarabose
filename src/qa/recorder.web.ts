import { record } from 'rrweb';

import { getQaSelector, isQaControl } from '@/qa/selector';
import {
  QaInteractionAction,
  QaInteractionStep,
  QaRecordingArtifact,
  QaRecordingController,
} from '@/qa/types';

const SCROLL_THROTTLE_MS = 500;
const MAX_UNCOMPRESSED_RECORDING_BYTES = 5 * 1024 * 1024 - 64 * 1024;

function getInputValue(target: EventTarget | null) {
  if (target instanceof HTMLInputElement) {
    if (target.type === 'checkbox' || target.type === 'radio') {
      return String(target.checked);
    }
    return target.value;
  }

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return target.value;
  }

  return undefined;
}

export function startQaRecording(
  onStep?: (count: number) => void,
  onSizeLimit?: () => void,
): QaRecordingController {
  const startedAt = new Date();
  const rrwebEvents: unknown[] = [];
  const steps: QaInteractionStep[] = [];
  const cleanupCallbacks: (() => void)[] = [];
  let stopped = false;
  let lastScrollAt = 0;
  let recordedBytes = 0;
  let sizeLimitReached = false;

  const addStep = (
    action: QaInteractionAction,
    target?: EventTarget | null,
    detail?: string,
    value?: string,
  ) => {
    if (isQaControl(target)) {
      return;
    }

    const selector = getQaSelector(target);
    steps.push({
      sequence: steps.length + 1,
      at: new Date().toISOString(),
      offsetMs: Date.now() - startedAt.getTime(),
      action,
      path: window.location.pathname + window.location.search,
      selector: selector.selector,
      label: selector.label,
      value,
      detail,
    });
    onStep?.(steps.length);
  };

  const clickListener = (event: MouseEvent) => addStep('click', event.target);
  const inputListener = (event: Event) => addStep('input', event.target, undefined, getInputValue(event.target));
  const submitListener = (event: SubmitEvent) => addStep('submit', event.target);
  const scrollListener = () => {
    const now = Date.now();
    if (now - lastScrollAt < SCROLL_THROTTLE_MS) {
      return;
    }
    lastScrollAt = now;
    addStep('scroll', document.scrollingElement, `x=${window.scrollX},y=${window.scrollY}`);
  };
  const navigationListener = () => addStep('navigation', document.body);
  const windowErrorListener = (event: ErrorEvent) =>
    addStep('console-error', document.body, event.message.slice(0, 2000));
  const rejectionListener = (event: PromiseRejectionEvent) =>
    addStep(
      'console-error',
      document.body,
      `Unhandled rejection: ${String(event.reason).slice(0, 2000)}`,
    );

  document.addEventListener('click', clickListener, true);
  document.addEventListener('input', inputListener, true);
  document.addEventListener('submit', submitListener, true);
  window.addEventListener('scroll', scrollListener, true);
  window.addEventListener('popstate', navigationListener);
  window.addEventListener('error', windowErrorListener);
  window.addEventListener('unhandledrejection', rejectionListener);

  cleanupCallbacks.push(
    () => document.removeEventListener('click', clickListener, true),
    () => document.removeEventListener('input', inputListener, true),
    () => document.removeEventListener('submit', submitListener, true),
    () => window.removeEventListener('scroll', scrollListener, true),
    () => window.removeEventListener('popstate', navigationListener),
    () => window.removeEventListener('error', windowErrorListener),
    () => window.removeEventListener('unhandledrejection', rejectionListener),
  );

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = (...args) => {
    originalPushState(...args);
    addStep('navigation', document.body);
  };
  history.replaceState = (...args) => {
    originalReplaceState(...args);
    addStep('navigation', document.body);
  };
  cleanupCallbacks.push(() => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  });

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    addStep(
      'console-error',
      document.body,
      args.map((value) => String(value)).join(' ').slice(0, 2000),
    );
    originalConsoleError(...args);
  };
  cleanupCallbacks.push(() => {
    console.error = originalConsoleError;
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const startedRequestAt = Date.now();
    const requestUrl = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;

    try {
      const response = await originalFetch(...args);
      if (!response.ok) {
        const parsedUrl = new URL(requestUrl, window.location.origin);
        addStep(
          'network-error',
          document.body,
          `${response.status} ${parsedUrl.pathname} (${Date.now() - startedRequestAt}ms)`,
        );
      }
      return response;
    } catch (error) {
      const parsedUrl = new URL(requestUrl, window.location.origin);
      addStep(
        'network-error',
        document.body,
        `FAILED ${parsedUrl.pathname} (${Date.now() - startedRequestAt}ms): ${String(error)}`,
      );
      throw error;
    }
  };
  cleanupCallbacks.push(() => {
    window.fetch = originalFetch;
  });

  const xhrRequests = new WeakMap<XMLHttpRequest, { method: string; url: string; startedAt: number }>();
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...args: unknown[]
  ) {
    xhrRequests.set(this, {
      method,
      url: String(url),
      startedAt: 0,
    });
    return originalXhrOpen.apply(this, [method, url, ...args] as Parameters<typeof originalXhrOpen>);
  };
  XMLHttpRequest.prototype.send = function (...args: Parameters<typeof originalXhrSend>) {
    const request = xhrRequests.get(this);
    if (request) {
      request.startedAt = Date.now();
      this.addEventListener(
        'loadend',
        () => {
          if (this.status === 0 || this.status >= 400) {
            const parsedUrl = new URL(request.url, window.location.origin);
            addStep(
              'network-error',
              document.body,
              `${request.method} ${parsedUrl.pathname}: ${this.status || 'FAILED'} (${Date.now() - request.startedAt}ms)`,
            );
          }
        },
        { once: true },
      );
    }
    return originalXhrSend.apply(this, args);
  };
  cleanupCallbacks.push(() => {
    XMLHttpRequest.prototype.open = originalXhrOpen;
    XMLHttpRequest.prototype.send = originalXhrSend;
  });

  const stopRrweb = record({
    emit: (event) => {
      rrwebEvents.push(event);
      recordedBytes += new TextEncoder().encode(JSON.stringify(event)).byteLength;
      if (!sizeLimitReached && recordedBytes >= MAX_UNCOMPRESSED_RECORDING_BYTES) {
        sizeLimitReached = true;
        window.setTimeout(() => {
          if (!stopped) {
            onSizeLimit?.();
          }
        }, 0);
      }
    },
    maskAllInputs: false,
    maskInputOptions: {
      password: false,
    },
    ignoreSelector: '[data-testid^="qa-"]',
    inlineImages: false,
    collectFonts: false,
    recordCanvas: false,
  });

  const finish = (): QaRecordingArtifact => {
    if (!stopped) {
      stopped = true;
      stopRrweb?.();
      cleanupCallbacks.reverse().forEach((cleanup) => cleanup());
    }

    const endedAt = new Date();
    return {
      version: 1,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      rrwebEvents,
      steps,
    };
  };

  return {
    stop: finish,
    cancel: () => {
      finish();
      rrwebEvents.length = 0;
      steps.length = 0;
    },
  };
}
