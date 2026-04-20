import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { completeMyMiniFactoryOAuthCodeFlow } from "@/server/services/myminifactory-auth-service";

export const runtime = "nodejs";

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

function redirectToSettings(request: Request, key: "success" | "error", message: string) {
  const currentUrl = new URL(request.url);
  const redirectUrl = new URL("/admin/settings", currentUrl.origin);
  redirectUrl.searchParams.set(key, message);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return redirectToSettings(request, "error", "Admin access is required.");
  }

  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  if (oauthError) {
    const message = oauthErrorDescription ? `${oauthError}: ${oauthErrorDescription}` : oauthError;
    return redirectToSettings(request, "error", `MyMiniFactory OAuth denied: ${message}`);
  }

  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  if (!code || !state) {
    return redirectToSettings(request, "error", "MyMiniFactory OAuth callback is missing code/state.");
  }

  try {
    await completeMyMiniFactoryOAuthCodeFlow({
      origin: resolveRequestOrigin(request),
      code,
      state,
    });

    revalidatePath("/admin/settings");
    return redirectToSettings(request, "success", "MyMiniFactory OAuth connected.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "MyMiniFactory OAuth callback failed.";
    return redirectToSettings(request, "error", message);
  }
}
