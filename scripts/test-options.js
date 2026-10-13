'use strict';
const os = require('node:os');

function automaticJobs() {
  const cpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const constrained = typeof process.constrainedMemory === 'function' ? process.constrainedMemory() : 0;
  const memory = Math.min(os.totalmem(), constrained || Infinity);
  // Integration workers may each start MongoDB, Vite or the TypeScript compiler.
  return Math.max(1, Math.min(4, cpus, Math.floor(memory / (1024 ** 3))));
}
function jobCount(value) {
  const count = /^\d+$/.test(String(value)) ? Number(value) : NaN;
  if (!Number.isSafeInteger(count) || count < 1 || count > 64)
    throw new Error('Die Anzahl paralleler Testdateien muss zwischen 1 und 64 liegen.');
  return count;
}
function parseTestOptions(args, env = process.env) {
  let jobs;
  let info = false;
  const forwarded = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--info') info = true;
    else if (arg === '--serial') jobs = 1;
    else if (arg === '--jobs' || arg === '--test-concurrency') jobs = jobCount(args[++index]);
    else if (arg.startsWith('--jobs=') || arg.startsWith('--test-concurrency=')) jobs = jobCount(arg.slice(arg.indexOf('=') + 1));
    else forwarded.push(arg);
  }
  const patterns = forwarded.filter(arg => !arg.startsWith('-') && /\.(?:js|mjs|cjs)$/.test(arg));
  jobs ??= env.AQUARIUM_TEST_JOBS === undefined ? automaticJobs() : jobCount(env.AQUARIUM_TEST_JOBS);
  return { info, jobs, patterns: patterns.length ? patterns : ['test/**/*.test.js'],
    options: forwarded.filter(arg => arg.startsWith('-') || !/\.(?:js|mjs|cjs)$/.test(arg)) };
}
module.exports = { automaticJobs, parseTestOptions };
