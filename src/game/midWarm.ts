export const MAX_MID_WARM = 50000;
export const WARM_BATCH_SIZE = 75;

export function clampWarmTicks(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_MID_WARM);
}

export type WarmBatchOpts = {
  total: number;
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
  step: () => void;
};

export async function runWarmBatches(opts: WarmBatchOpts): Promise<void> {
  const total = clampWarmTicks(opts.total);
  if (total === 0) return;
  const batchSize = opts.batchSize ?? WARM_BATCH_SIZE;
  let done = 0;
  while (done < total) {
    const batch = Math.min(batchSize, total - done);
    for (let i = 0; i < batch; i++) opts.step();
    done += batch;
    opts.onProgress?.(done, total);
    if (done < total) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
