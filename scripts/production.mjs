import { spawn } from "node:child_process";
import process from "node:process";

const children = [
  {
    name: "web",
    process: spawn("./node_modules/.bin/next", ["start"], { stdio: "inherit", env: process.env }),
  },
  {
    name: "file-worker",
    process: spawn("./node_modules/.bin/tsx", ["src/server/jobs/file-processing-worker.ts"], {
      stdio: "inherit",
      env: { ...process.env, PMP_FILE_WORKER_CONCURRENCY: process.env.PMP_FILE_WORKER_CONCURRENCY || "1" },
    }),
  },
];

let stopping = false;
let exitedChildren = 0;

function stop(signal = "SIGTERM", exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.process.exitCode === null && child.process.signalCode === null) child.process.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => stop(signal));
}

for (const child of children) {
  child.process.once("error", (error) => {
    console.error(`Unable to start PMP ${child.name}.`, error);
    stop("SIGTERM", 1);
  });
  child.process.once("exit", (code, signal) => {
    exitedChildren += 1;
    if (!stopping) {
      console.error(`PMP ${child.name} exited unexpectedly (${signal ? `signal ${signal}` : `code ${code ?? 1}`}).`);
      stop("SIGTERM", code && code > 0 ? code : 1);
    }
    if (exitedChildren === children.length) process.exit(process.exitCode ?? 0);
  });
}

console.log("PMP production services starting: web + file worker.");
