// Types for scanCheckIn.mjs (plain ESM impl; this declaration gives the app
// strict-mode types without compiling the runtime file).

export type ScanCheckInStep = "idle" | "wait" | "open" | "stay";

export declare function scanCheckInStep(input: {
  pending: boolean;
  locationChecked: boolean;
  hasUserLocation: boolean;
  hasVenueGeo: boolean;
  hasVenueName: boolean;
  insideGeofence: boolean;
}): ScanCheckInStep;
