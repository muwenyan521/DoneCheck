import type { WorkspaceVolume } from "@donecheck/core";

export const bundledFreeLimits = {
  analyzableFileCount: 250,
  largestAnalyzableFileBytes: 256 * 1024,
  totalAnalyzableBytes: 2 * 1024 * 1024,
} as const;

export type BundledFreeLimitCode = "file-count" | "largest-file-bytes" | "total-bytes";

export interface BundledFreeEligibility {
  readonly eligible: boolean;
  readonly exceeded: readonly BundledFreeLimitCode[];
  readonly limits: typeof bundledFreeLimits;
  readonly volume: WorkspaceVolume;
}

export function evaluateBundledFreeEligibility(volume: WorkspaceVolume): BundledFreeEligibility {
  const exceeded: BundledFreeLimitCode[] = [];
  if (volume.analyzableFileCount > bundledFreeLimits.analyzableFileCount) {
    exceeded.push("file-count");
  }
  if (volume.totalAnalyzableBytes > bundledFreeLimits.totalAnalyzableBytes) {
    exceeded.push("total-bytes");
  }
  if (volume.largestAnalyzableFileBytes > bundledFreeLimits.largestAnalyzableFileBytes) {
    exceeded.push("largest-file-bytes");
  }
  return {
    eligible: exceeded.length === 0,
    exceeded,
    limits: bundledFreeLimits,
    volume,
  };
}
