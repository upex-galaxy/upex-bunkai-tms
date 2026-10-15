// BK-443 — a trailing-edge debounce. The workbench mirrors its text filters
// into the address, and a keystroke-rate stream of history.replaceState calls
// is wasteful (Next patches replaceState into a router action) and trips the
// browsers' history-call throttle. `call` restarts the timer; only the last one
// fires. `cancel` drops a pending call (unmount, route change).

export interface Debounced<A extends unknown[]> {
  call: (...args: A) => void
  cancel: () => void
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    call: (...args) => {
      if (timer !== null) { clearTimeout(timer); }
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, delayMs);
    },
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
