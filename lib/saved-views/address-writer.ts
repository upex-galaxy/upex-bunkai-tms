import type { SavedViewState } from './state';
import { debounce } from './debounce';
import { workbenchAddress } from './workbench-state';

// BK-443 — the debounced write of the workbench filters into the address.
//
// A `history.replaceState` is not free of side effects under the App Router:
// Next turns it into a router RESTORE, which marks any navigation that is still
// pending as discarded. So the write must never fire while the member is on
// their way somewhere else:
//   * the timer callback re-checks the pathname and bails unless the address is
//     still the project index (a navigation may have committed after the timer
//     was set but before the effect cleanup ran);
//   * the owner cancels the pending write the moment a navigation starts
//     (a click on a link, closing a tab) and on unmount;
//   * an unchanged address is never rewritten.
// The pending-navigation case cannot be seen from here, which is why starting a
// navigation CANCELS rather than flushes: the effect writes again once the
// member is back on the index route.

export interface AddressWriterDeps {
  delayMs: number
  // The pathname of the project index route, e.g. `/projects/demo`.
  indexPath: string
  location: () => { pathname: string, search: string }
  replace: (url: string) => void
}

export interface AddressWriter {
  schedule: (state: SavedViewState) => void
  cancel: () => void
}

export function createAddressWriter(deps: AddressWriterDeps): AddressWriter {
  const debounced = debounce((state: SavedViewState) => {
    const location = deps.location();
    if (location.pathname !== deps.indexPath) { return; }
    const url = workbenchAddress(location, state);
    if (url !== null) { deps.replace(url); }
  }, deps.delayMs);
  return { schedule: debounced.call, cancel: debounced.cancel };
}

// Is this click (captured at the document) on a link, i.e. a navigation that is
// about to start?
export function isLinkTarget(target: unknown): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return typeof element?.closest === 'function' && element.closest('a[href]') !== null;
}
