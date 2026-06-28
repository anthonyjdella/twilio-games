// client/zone-gate.ts
/** Zones auto-cycle ONLY when a level has not locked its own per-level lighting. */
export function shouldCycleZones(lightingLocked: boolean): boolean { return !lightingLocked; }
