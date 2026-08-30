import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const apply = process.argv.includes("--apply");

async function main() {
  const [filaments, partialRolls, requirements] = await Promise.all([
    prisma.filament.count(),
    prisma.filamentPartialRoll.count(),
    prisma.productFilamentRequirement.count(),
  ]);
  console.log(`Legacy filament cleanup ${apply ? "APPLY" : "dry run"}:`);
  console.log(`- Filament records: ${filaments}`);
  console.log(`- Filament partial rolls: ${partialRolls}`);
  console.log(`- Product filament requirements: ${requirements}`);
  if (!apply) {
    console.log("No data was removed. Re-run with --apply to permanently delete these legacy records.");
    return;
  }

  await prisma.$transaction([
    prisma.productFilamentRequirement.deleteMany(),
    prisma.filamentPartialRoll.deleteMany(),
    prisma.filament.deleteMany(),
  ]);
  console.log("Legacy filament records removed. BambuBuddy mappings and requirements were preserved.");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
