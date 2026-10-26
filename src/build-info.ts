/** Bump when analysis, segmentation, quantization or MIDI output changes for the same input. */
export const PIPELINE_VERSION = 4;

/** A revision identifies the source; pipeline changes identify replay compatibility. */
export const BUILD_INFO =
  typeof __APP_BUILD__ === "undefined"
    ? { version: "unknown", revision: "unknown", source: "unknown", pipeline: PIPELINE_VERSION }
    : __APP_BUILD__;
