import { spawn } from "node:child_process";
import process from "node:process";

const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const children = [
  spawn(executable, ["next", "dev"], { stdio: "inherit", env: process.env }),
  spawn(executable, ["tsx", "src/server/jobs/file-processing-worker.ts"], { stdio: "inherit", env: { ...process.env, PMP_FILE_WORKER_CONCURRENCY: process.env.PMP_FILE_WORKER_CONCURRENCY || "2" } }),
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop(signal));
for (const child of children) child.once("exit", (code) => {
  if (!stopping) {
    stop();
    process.exitCode = code ?? 1;
  }
});
