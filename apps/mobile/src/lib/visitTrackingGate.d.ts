// Types for visitTrackingGate.mjs (plain ESM impl; this declaration gives the
// app strict-mode types without compiling the runtime file).
export interface VisitTrackingGateInput {
  consent: boolean;
  consentLoading: boolean;
  venueCount: number;
}
export declare function shouldTrack(input: VisitTrackingGateInput): boolean;
