// Decides when a navigation state change is a NEW screen view worth reporting.
// Plain ESM (types in screenViewTracker.d.ts) so `node --test` can exercise it
// directly — see test/mobile-heycatch-install.test.mjs.
//
// React Navigation fires onStateChange for more than screen changes (param
// updates, a tab re-press, a modal dismissing back to the same route), and the
// HeyCatch guide asks for the current screen name "skipping repeats of the same
// name". Only the route NAME is reported — never params: SharedItinerary's
// params carry a share token and CheckIn's carry the user's coordinates.

/**
 * @param {(name: string) => void} report called once per distinct consecutive screen
 * @returns {(name: unknown) => void} feed it the current route name on every change
 */
export function createScreenViewTracker(report) {
  let last = null;
  return (name) => {
    if (typeof name !== "string" || name.length === 0) return;
    if (name === last) return;
    last = name;
    report(name);
  };
}
