export type SetupCheckStatus = "unchecked" | "checking" | "passed" | "attention";

export interface SetupCheck {
  id: string;
  label: string;
  status: SetupCheckStatus;
  detail: string;
  blocking: boolean;
}

export interface MeasurementResult {
  pass: boolean;
  checks: SetupCheck[];
}

export interface RoomResult extends MeasurementResult {
  floor: number;
  gate: number;
}

export interface EndpointResult extends MeasurementResult {
  frequency: number | null;
}
