/** A revision identifies the source; pipeline changes identify replay compatibility. */
export const BUILD_INFO =
  typeof __APP_BUILD__ === "undefined"
    ? { version: "unknown", revision: "unknown", source: "unknown", pipeline: 2 }
    : __APP_BUILD__;
