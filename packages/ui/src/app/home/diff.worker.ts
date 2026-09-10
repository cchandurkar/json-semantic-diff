/// <reference lib="webworker" />

import { runDiffTask, type DiffTaskRequest } from './diff-worker-task';

addEventListener('message', ({ data }: MessageEvent<DiffTaskRequest>) => {
  postMessage(runDiffTask(data));
});
