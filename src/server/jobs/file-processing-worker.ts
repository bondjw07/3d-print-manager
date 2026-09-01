import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runOneProductFileJob } from "./product-file-job-runner";

try { process.loadEnvFile?.(); } catch {}

function configuredConcurrency() {
  const configured = Number(process.env.PMP_FILE_WORKER_CONCURRENCY);
  if (Number.isInteger(configured) && configured > 0 && configured <= 32) return configured;
  return 2;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

const workerId = `file-worker-${randomUUID()}`;
const concurrency = configuredConcurrency();
console.log(`PMP file worker ${workerId} starting with concurrency ${concurrency}.`);

async function lane(index: number) {
  while (!stopping) {
    const worked = await runOneProductFileJob(`${workerId}-${index}`);
    if (!worked) await wait(1000);
  }
}

async function main() {
  try {
    await Promise.all(Array.from({ length: concurrency }, (_, index) => lane(index + 1)));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error("PMP file worker stopped unexpectedly.", error);
  process.exitCode = 1;
});
