import { NextResponse, type NextRequest } from "next/server";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient();

const SETUP_PATH = "/setup";
const LOGIN_PATH = "/login";
const PRIVATE_UPLOAD_PATH = "/uploads/pmp-files";

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const setupTestModeEnabled = process.env.ENABLE_INITIAL_ADMIN_TEST_MODE === "true";
  const setupTestRequested = searchParams.get("testSetup") === "1";
  const isSetupPath = pathname.startsWith(SETUP_PATH);

  // PMP artifacts share the durable public uploads mount, but must never be
  // served as public static assets. Authenticated downloads use API routes.
  if (pathname === PRIVATE_UPLOAD_PATH || pathname.startsWith(`${PRIVATE_UPLOAD_PATH}/`)) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (!existingAdmin) {
      if (!isSetupPath) {
        return NextResponse.redirect(new URL(SETUP_PATH, request.url));
      }
      return NextResponse.next();
    }

    if (isSetupPath && !(setupTestModeEnabled && setupTestRequested)) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }
  } catch {
    // Allow request flow to continue so runtime errors can be surfaced normally.
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/uploads/pmp-files/:path*",
    // Exclude API routes and static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
