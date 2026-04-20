import { type AppSetting } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSettings } from "./settings-service";
import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";

const MY_MINI_FACTORY_AUTHORIZATION_URL = "https://auth.myminifactory.com/web/authorize";
const MY_MINI_FACTORY_TOKEN_URL = "https://auth.myminifactory.com/v1/oauth/";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;
const ACCESS_TOKEN_EXPIRY_SAFETY_MS = 60 * 1_000;

type OAuthTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

export type MyMiniFactoryIntegrationStatus = {
  hasCredentials: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  isAccessTokenExpired: boolean;
  tokenExpiresAt: Date | null;
  connectedAt: Date | null;
};

function deriveEncryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY is not configured. Set it before saving MyMiniFactory credentials.");
  }

  return createHash("sha256").update(raw).digest();
}

function hashSensitiveValue(value: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = pbkdf2Sync(value, salt, 120_000, 32, "sha512").toString("hex");
  return `pbkdf2_sha512$120000$${salt}$${derived}`;
}

function encryptSensitiveValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

function decryptSensitiveValue(payload: string) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = payload.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Invalid encrypted payload format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

function isTokenExpired(expiresAt: Date | null) {
  if (!expiresAt) {
    return false;
  }

  return expiresAt.getTime() <= Date.now() + ACCESS_TOKEN_EXPIRY_SAFETY_MS;
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseTokenExpiry(payload: OAuthTokenPayload) {
  const expiresInSeconds = toOptionalNumber(payload.expires_in);
  if (!expiresInSeconds || expiresInSeconds <= 0) {
    return null;
  }

  return new Date(Date.now() + expiresInSeconds * 1_000);
}

function tokenErrorMessage(payload: OAuthTokenPayload, rawText: string, status: number) {
  const preferred =
    toOptionalString(payload.error_description) ??
    toOptionalString(payload.error) ??
    toOptionalString(payload.message);

  if (preferred) {
    return `MyMiniFactory OAuth request failed (${status}): ${preferred}`;
  }

  const raw = rawText.trim();
  if (raw) {
    return `MyMiniFactory OAuth request failed (${status}): ${raw.slice(0, 240)}`;
  }

  return `MyMiniFactory OAuth request failed (${status}).`;
}

function tokenEndpointUrl(input: { clientId: string; redirectUri: string; state?: string }) {
  const endpoint = new URL(MY_MINI_FACTORY_TOKEN_URL);
  endpoint.searchParams.set("client_id", input.clientId);
  endpoint.searchParams.set("redirect_uri", input.redirectUri);
  endpoint.searchParams.set("response_type", "code");
  if (input.state) {
    endpoint.searchParams.set("state", input.state);
  }
  return endpoint;
}

async function requestOAuthToken(input: {
  grantType: "authorization_code" | "refresh_token";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  state?: string;
  code?: string;
  refreshToken?: string;
}) {
  const endpoint = tokenEndpointUrl({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    state: input.state,
  });

  const body = new URLSearchParams();
  body.set("grant_type", input.grantType);
  body.set("client_id", input.clientId);
  body.set("client_secret", input.clientSecret);
  body.set("redirect_uri", input.redirectUri);

  if (input.grantType === "authorization_code") {
    if (!input.code) {
      throw new Error("OAuth code is required for authorization_code exchange.");
    }
    body.set("code", input.code);
  } else {
    if (!input.refreshToken) {
      throw new Error("Refresh token is required for refresh_token exchange.");
    }
    body.set("refresh_token", input.refreshToken);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  const rawText = await response.text();
  let payload: OAuthTokenPayload = {};

  try {
    payload = JSON.parse(rawText) as OAuthTokenPayload;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(tokenErrorMessage(payload, rawText, response.status));
  }

  const accessToken = toOptionalString(payload.access_token);
  if (!accessToken) {
    throw new Error("MyMiniFactory OAuth response did not include an access token.");
  }

  return payload;
}

async function updateMyMiniFactoryTokens(
  settings: AppSetting,
  payload: OAuthTokenPayload,
  redirectUri: string,
  fallbackRefreshToken?: string,
) {
  const accessToken = toOptionalString(payload.access_token);
  if (!accessToken) {
    throw new Error("Missing MyMiniFactory access token.");
  }

  const refreshToken = toOptionalString(payload.refresh_token) ?? fallbackRefreshToken;
  const tokenType = toOptionalString(payload.token_type) ?? null;
  const tokenScope = toOptionalString(payload.scope) ?? null;
  const tokenExpiresAt = parseTokenExpiry(payload);

  await prisma.appSetting.update({
    where: { id: settings.id },
    data: {
      myMiniFactoryAccessTokenEncrypted: encryptSensitiveValue(accessToken),
      myMiniFactoryRefreshTokenEncrypted: refreshToken ? encryptSensitiveValue(refreshToken) : null,
      myMiniFactoryTokenType: tokenType,
      myMiniFactoryTokenScope: tokenScope,
      myMiniFactoryTokenExpiresAt: tokenExpiresAt,
      myMiniFactoryConnectedAt: new Date(),
      myMiniFactoryOauthStateHash: null,
      myMiniFactoryOauthStateExpiresAt: null,
      myMiniFactoryOauthRedirectUri: redirectUri,
    },
  });
}

export async function getMyMiniFactoryIntegrationStatus(): Promise<MyMiniFactoryIntegrationStatus> {
  const settings = await getSettings();
  const hasCredentials = Boolean(
    settings.myMiniFactoryClientIdHash &&
      settings.myMiniFactoryClientSecretHash &&
      settings.myMiniFactoryClientIdEncrypted &&
      settings.myMiniFactoryClientSecretEncrypted,
  );
  const tokenExpiresAt = settings.myMiniFactoryTokenExpiresAt;

  return {
    hasCredentials,
    hasAccessToken: Boolean(settings.myMiniFactoryAccessTokenEncrypted),
    hasRefreshToken: Boolean(settings.myMiniFactoryRefreshTokenEncrypted),
    isAccessTokenExpired: isTokenExpired(tokenExpiresAt),
    tokenExpiresAt,
    connectedAt: settings.myMiniFactoryConnectedAt,
  };
}

export async function saveMyMiniFactoryClientCredentials(input: {
  clientId: string;
  clientSecret: string;
}) {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();

  if (!clientId || !clientSecret) {
    throw new Error("MyMiniFactory client ID and client secret are required.");
  }

  const settings = await getSettings();
  await prisma.appSetting.update({
    where: { id: settings.id },
    data: {
      myMiniFactoryClientIdHash: hashSensitiveValue(clientId),
      myMiniFactoryClientSecretHash: hashSensitiveValue(clientSecret),
      myMiniFactoryClientIdEncrypted: encryptSensitiveValue(clientId),
      myMiniFactoryClientSecretEncrypted: encryptSensitiveValue(clientSecret),
      myMiniFactoryAccessTokenEncrypted: null,
      myMiniFactoryRefreshTokenEncrypted: null,
      myMiniFactoryTokenType: null,
      myMiniFactoryTokenScope: null,
      myMiniFactoryTokenExpiresAt: null,
      myMiniFactoryConnectedAt: null,
      myMiniFactoryOauthStateHash: null,
      myMiniFactoryOauthStateExpiresAt: null,
      myMiniFactoryOauthRedirectUri: null,
    },
  });
}

export async function disconnectMyMiniFactoryOAuth() {
  const settings = await getSettings();
  await prisma.appSetting.update({
    where: { id: settings.id },
    data: {
      myMiniFactoryAccessTokenEncrypted: null,
      myMiniFactoryRefreshTokenEncrypted: null,
      myMiniFactoryTokenType: null,
      myMiniFactoryTokenScope: null,
      myMiniFactoryTokenExpiresAt: null,
      myMiniFactoryConnectedAt: null,
      myMiniFactoryOauthStateHash: null,
      myMiniFactoryOauthStateExpiresAt: null,
      myMiniFactoryOauthRedirectUri: null,
    },
  });
}

export async function createMyMiniFactoryAuthorizationUrl(input: { origin: string }) {
  const settings = await getSettings();
  if (!settings.myMiniFactoryClientIdEncrypted || !settings.myMiniFactoryClientSecretEncrypted) {
    throw new Error("Save MyMiniFactory client credentials in Settings before connecting OAuth.");
  }

  const clientId = decryptSensitiveValue(settings.myMiniFactoryClientIdEncrypted);
  const state = randomBytes(24).toString("hex");
  const stateHash = hashOAuthState(state);
  const stateExpiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  const redirectUri = `${input.origin}/api/admin/myminifactory/oauth/callback`;

  await prisma.appSetting.update({
    where: { id: settings.id },
    data: {
      myMiniFactoryOauthStateHash: stateHash,
      myMiniFactoryOauthStateExpiresAt: stateExpiresAt,
      myMiniFactoryOauthRedirectUri: redirectUri,
    },
  });

  const authorizeUrl = new URL(MY_MINI_FACTORY_AUTHORIZATION_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);

  return authorizeUrl.toString();
}

export async function completeMyMiniFactoryOAuthCodeFlow(input: {
  origin: string;
  code: string;
  state: string;
}) {
  const settings = await getSettings();
  const expectedStateHash = settings.myMiniFactoryOauthStateHash;
  const expectedStateExpiry = settings.myMiniFactoryOauthStateExpiresAt;

  if (!expectedStateHash || !expectedStateExpiry) {
    throw new Error("Missing OAuth state. Start OAuth from Settings and try again.");
  }

  if (expectedStateExpiry.getTime() < Date.now()) {
    throw new Error("OAuth state expired. Start the MyMiniFactory OAuth flow again.");
  }

  const receivedStateHash = hashOAuthState(input.state);
  if (expectedStateHash !== receivedStateHash) {
    throw new Error("OAuth state mismatch. Start the MyMiniFactory OAuth flow again.");
  }

  if (!settings.myMiniFactoryClientIdEncrypted || !settings.myMiniFactoryClientSecretEncrypted) {
    throw new Error("MyMiniFactory credentials are not configured.");
  }

  const clientId = decryptSensitiveValue(settings.myMiniFactoryClientIdEncrypted);
  const clientSecret = decryptSensitiveValue(settings.myMiniFactoryClientSecretEncrypted);
  const redirectUri = `${input.origin}/api/admin/myminifactory/oauth/callback`;

  const payload = await requestOAuthToken({
    grantType: "authorization_code",
    clientId,
    clientSecret,
    redirectUri,
    state: input.state,
    code: input.code,
  });

  await updateMyMiniFactoryTokens(settings, payload, redirectUri);
}

async function refreshMyMiniFactoryAccessToken(settings: AppSetting) {
  if (
    !settings.myMiniFactoryClientIdEncrypted ||
    !settings.myMiniFactoryClientSecretEncrypted ||
    !settings.myMiniFactoryRefreshTokenEncrypted
  ) {
    throw new Error("MyMiniFactory OAuth refresh is unavailable. Reconnect from Settings.");
  }

  const clientId = decryptSensitiveValue(settings.myMiniFactoryClientIdEncrypted);
  const clientSecret = decryptSensitiveValue(settings.myMiniFactoryClientSecretEncrypted);
  const refreshToken = decryptSensitiveValue(settings.myMiniFactoryRefreshTokenEncrypted);
  const redirectUri =
    settings.myMiniFactoryOauthRedirectUri ??
    (process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/+$/, "")}/api/admin/myminifactory/oauth/callback`
      : "http://localhost:3000/api/admin/myminifactory/oauth/callback");

  const payload = await requestOAuthToken({
    grantType: "refresh_token",
    clientId,
    clientSecret,
    redirectUri,
    refreshToken,
  });

  await updateMyMiniFactoryTokens(settings, payload, redirectUri, refreshToken);

  const refreshedToken = toOptionalString(payload.access_token);
  if (!refreshedToken) {
    throw new Error("MyMiniFactory OAuth refresh did not return an access token.");
  }

  return refreshedToken;
}

export async function getMyMiniFactoryAccessToken() {
  const settings = await getSettings();
  if (!settings.myMiniFactoryAccessTokenEncrypted) {
    throw new Error("MyMiniFactory OAuth is not connected. Connect it from Settings before bulk import.");
  }

  if (isTokenExpired(settings.myMiniFactoryTokenExpiresAt)) {
    if (!settings.myMiniFactoryRefreshTokenEncrypted) {
      throw new Error("MyMiniFactory OAuth token expired. Reconnect from Settings.");
    }

    return refreshMyMiniFactoryAccessToken(settings);
  }

  return decryptSensitiveValue(settings.myMiniFactoryAccessTokenEncrypted);
}
