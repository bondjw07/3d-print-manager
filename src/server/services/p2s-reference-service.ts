import { prisma } from "@/lib/prisma";

export function getP2sReference() {
  return prisma.applicationFile.findUnique({ where: { kind: "P2S_REFERENCE" } });
}
