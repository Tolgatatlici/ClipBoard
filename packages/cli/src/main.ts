import { promptHidden } from './prompt.js';
import { run } from './cli.js';

const code = await run(process.argv.slice(2), {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  cwd: process.cwd(),
  prompt: process.stdin.isTTY
    ? (question) => promptHidden(question, process.stdin, process.stderr)
    : null,
});
process.exitCode = code;
