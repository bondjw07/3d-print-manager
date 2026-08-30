import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettings } from "./settings-service";

function encryptionKey() {
  const secret = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("APP_ENCRYPTION_KEY is not configured. Set it before saving the BambuBuddy API key.");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decrypt(payload: string) {
  const [version, iv, tag, encrypted] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted BambuBuddy API key.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function saveBambuBuddyApiKey(apiKey: string) {
  const settings = await getSettings();
  await prisma.appSetting.update({
    where: { id: settings.id },
    data: { bambuBuddyApiKeyEncrypted: encrypt(apiKey.trim()) },
  });
}

export async function getBambuBuddyApiKey() {
  const settings = await getSettings();
  if (settings.bambuBuddyApiKeyEncrypted) return decrypt(settings.bambuBuddyApiKeyEncrypted);
  return process.env.BAMBUDDY_API_KEY?.trim() || undefined;
}
