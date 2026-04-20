import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { discoverMyMiniFactoryCreatorObjectUrls } from "@/server/importers/myminifactory-importer";
import { getMyMiniFactoryAccessToken } from "@/server/services/myminifactory-auth-service";

export const runtime = "nodejs";

type DiscoveryRequestBody = {
  creator?: string;
  maxPages?: number;
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DiscoveryRequestBody;
  try {
    body = (await request.json()) as DiscoveryRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const creator = String(body.creator ?? "").trim();
  const parsedMaxPages = Number(body.maxPages);
  const maxPages = Number.isFinite(parsedMaxPages) ? Math.floor(parsedMaxPages) : undefined;

  if (!creator) {
    return NextResponse.json({ error: "creator is required." }, { status: 400 });
  }

  try {
    const accessToken = await getMyMiniFactoryAccessToken();
    const result = await discoverMyMiniFactoryCreatorObjectUrls({
      creator,
      accessToken,
      maxPages,
    });

    return NextResponse.json({
      result: {
        creatorUrl: result.creatorUrl,
        creatorName: result.creatorName,
        pagesScanned: result.pagesScanned,
        discoveredCount: result.modelUrls.length,
        modelUrls: result.modelUrls,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Creator discovery failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
