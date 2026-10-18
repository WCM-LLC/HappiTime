/**
 * Returns a function to call with the current route name on every navigation
 * state change; `report` fires once per distinct consecutive screen name.
 */
export declare function createScreenViewTracker(
  report: (name: string) => void
): (name: unknown) => void;
