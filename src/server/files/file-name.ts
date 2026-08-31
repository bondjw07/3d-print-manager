import path from "node:path";

export function normalizeUploadedFileName(value: string) {
  const baseName = path.basename(value.replaceAll("\\", "/")).replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!baseName) throw new Error("A file name is required.");
  return baseName.slice(0, 255);
}

export function attachmentContentDisposition(fileName: string) {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "download";
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
