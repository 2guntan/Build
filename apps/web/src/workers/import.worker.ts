/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { parsePlotFile } from '../lib/geo-import';

const api = {
  parse(name: string, text: string) {
    return parsePlotFile(name, text);
  },
};

export type ImportWorkerApi = typeof api;
Comlink.expose(api);
