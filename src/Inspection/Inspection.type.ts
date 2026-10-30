import type { RecordingOrigin } from "../Recording/Recording.type";
import type { Knobs } from "../melody/knobs";
import type { KeyChoice } from "../melody/interpret";
import type { PortableTune } from "../portable-tune";
import type { ReadRecordingPackage } from "../recording-package-types";
import type { AnalysisSettings } from "../Recording/SoundProfile.type";

export type ViewName = "saved" | "replay" | "automatic";
export type OverallResult = "pass" | "incomplete" | "mismatch" | "fail";
export type CheckStatus = "pass" | "fail" | "mismatch" | "skipped";
export interface InputIdentity {
  wavSha256: string;
  pcmSha256: string | null;
  path: string;
  sampleRate: number | null;
  sampleCount: number | null;
}
export interface ExecutionIdentity {
  codeRuntimeKey: string | null;
  runKey: string | null;
  build: RecordingOrigin["build"];
  pipelineVersion: number;
  interpretationVersion: number;
}
export interface QueryScope {
  total: number;
  returned: number;
  offset: number;
  limit: number;
  omitted: number;
}
export interface NextStep {
  code: string;
  reason: string;
  argv: string[];
}
export interface Finding {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  evidence: string[];
}
export interface Report<T> {
  schemaVersion: 1;
  kind: string;
  input: InputIdentity | null;
  view: ViewName | null;
  execution: ExecutionIdentity | null;
  scope: QueryScope;
  overall: OverallResult;
  findings: Finding[];
  data: T;
  nextSteps: NextStep[];
}
export interface ResolvedRecipe {
  schemaVersion: 1;
  name: string;
  digest: string;
  inputWavSha256: string;
  knobs: Knobs;
  overrides: Partial<Knobs>;
  key: KeyChoice;
  timing: { bpm: number; beatsPerBar: number };
  range: { minMidi: number; maxMidi: number };
  analysis: AnalysisSettings;
  play: PortableTune["play"];
  intent: "automatic" | "apply";
  segments: "recompute" | "saved" | "baseline";
  interpretationVersion: 1 | 2;
  savedBuild: RecordingOrigin["build"];
}
export interface StageProvenance {
  stage: string;
  key: string;
  disposition: "saved" | "reused" | "recomputed";
  inputs: string[];
}
export interface StageStore {
  read(key: string): Promise<unknown | undefined>;
  write(key: string, value: unknown): Promise<void>;
}
export interface InvestigationContext {
  input: ReadRecordingPackage;
  identity: InputIdentity;
  execution: ExecutionIdentity;
  stages: StageStore;
  stageKey?: (stage: string, dependencies: unknown) => string | null;
}
