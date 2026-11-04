import * as Comlink from 'comlink';
import type { BuildWorkerApi } from './build.worker';

let worker: Comlink.Remote<BuildWorkerApi> | null = null;

export function buildWorker(): Comlink.Remote<BuildWorkerApi> {
  if (!worker) {
    const w = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
    worker = Comlink.wrap<BuildWorkerApi>(w);
  }
  return worker;
}
