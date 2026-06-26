/**
 * Shared tsup presets for the DoneCheck workspace.
 *
 * Packages should reuse these presets and only override the minimal
 * package-specific differences (entry, external, format, …) instead of
 * hand-writing a full tsup config.
 */

/**
 * Preset for Node-targeted libraries (shared, core, templates, desktop).
 */
export const nodeLibraryPreset = {
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  sourcemap: true,
  splitting: false,
  target: "node22",
};

/**
 * Factory for React component libraries (report-ui).
 *
 * Accepts minimal overrides so consumers do not have to restate the full
 * config. `external` defaults to React peer dependencies so they are never
 * bundled into the library output.
 *
 * @param {object} [overrides] - Package-specific tsup options.
 * @returns {import('tsup').Options}
 */
export function reactLibraryPreset(overrides = {}) {
  return {
    ...nodeLibraryPreset,
    // React is a peer dependency; never bundle it.
    external: ["react", "react-dom"],
    // React libraries target a broader ES range than Node-only packages.
    target: "es2023",
    ...overrides,
  };
}
