import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { createMyMiniFactoryAuthorizationUrl } from "@/server/services/myminifactory-auth-service";

export const runtime = "nodejs";

function settingsRedirectFromRequest(request: Request, message: string) {
  const currentUrl = new URL(request.url);
  const redirectUrl = new URL("/admin/settings", currentUrl.origin);
  redirectUrl.searchParams.set("error", message);
  return NextResponse.redirect(redirectUrl);
}

function resolveRequestOrigin(request: Request) {
  const currentUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (!forwardedHost) {
    return currentUrl.origin;
  }

  const proto = forwardedProto || currentUrl.protocol.replace(":", "");
  return `${proto}://${forwardedHost}`;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return settingsRedirectFromRequest(request, "Admin access is required.");
  }

  try {
    const authorizeUrl = await createMyMiniFactoryAuthorizationUrl({
      origin: resolveRequestOrigin(request),
    });
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start MyMiniFactory OAuth.";
    return settingsRedirectFromRequest(request, message);
  }
}
