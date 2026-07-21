export function throttle(fn, waitMs) {
  let lastCall = 0;
  let pendingArgs = null;
  let timeoutId = null;

  function invoke(args) {
    lastCall = Date.now();
    pendingArgs = null;
    fn(...args);
  }

  return (...args) => {
    const now = Date.now();
    const remaining = waitMs - (now - lastCall);
    if (remaining <= 0) {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      invoke(args);
    } else {
      pendingArgs = args;
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          timeoutId = null;
          if (pendingArgs) invoke(pendingArgs);
        }, remaining);
      }
    }
  };
}
