import { openAsBlob } from "node:fs";

export class BambuBuddyApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export type BambuBuddyFolder = {
  id: number;
  name: string;
  parent_id: number | null;
  children?: BambuBuddyFolder[];
};

export type BambuBuddyFile = {
  id: number;
  folder_id: number | null;
  filename: string;
  file_size: number;
  file_hash?: string | null;
  print_time_seconds?: number | null;
  filament_used_grams?: number | null;
  metadata?: {
    print_time_seconds?: unknown;
    filament_used_grams?: unknown;
    filament_slots?: Array<{ type?: unknown; color?: unknown; used_g?: unknown }>;
  } | null;
};

export type BambuBuddyTag = { id: number; name: string };

export class BambuBuddyClient {
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}

  private async request<T>(apiPath: string, init?: RequestInit) {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${apiPath}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(this.apiKey ? { "X-API-Key": this.apiKey } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json() as { detail?: unknown };
        if (typeof payload.detail === "string") detail = `: ${payload.detail}`;
      } catch {}
      throw new BambuBuddyApiError(`BambuBuddy returned ${response.status}${detail}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  listFolders() {
    return this.request<BambuBuddyFolder[]>("/api/v1/library/folders");
  }

  createFolder(name: string, parentId: number | null) {
    return this.request<BambuBuddyFolder>("/api/v1/library/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_id: parentId }),
    });
  }

  getFile(fileId: number) {
    return this.request<BambuBuddyFile>(`/api/v1/library/files/${fileId}`);
  }

  listFiles(folderId: number) {
    return this.request<BambuBuddyFile[]>(`/api/v1/library/files?folder_id=${folderId}&include_root=false`);
  }

  async uploadFile(folderId: number, filePath: string, fileName: string) {
    const form = new FormData();
    form.append("file", await openAsBlob(filePath, { type: "application/octet-stream" }), fileName);
    return this.request<{ id: number; filename: string; file_size: number; duplicate_of?: number | null }>(
      `/api/v1/library/files?folder_id=${folderId}&generate_stl_thumbnails=false`,
      { method: "POST", body: form },
    );
  }

  listTags() {
    return this.request<BambuBuddyTag[]>("/api/v1/library/tags");
  }

  createTag(name: string) {
    return this.request<BambuBuddyTag>("/api/v1/library/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  replaceFileTags(fileId: number, tagIds: number[]) {
    return this.request<{ files_updated: number; associations_added: number; associations_removed: number }>(
      "/api/v1/library/tags/bulk-assign",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_ids: [fileId], tag_ids: tagIds, action: "replace" }),
      },
    );
  }
}

export function normalizeBambuBuddyFolderName(value: string) {
  const normalized = value.replace(/[\\/]+/g, " - ").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!normalized) throw new Error("BambuBuddy folder name cannot be empty.");
  return normalized.slice(0, 255);
}

function findChild(folders: BambuBuddyFolder[], parentId: number | null, name: string) {
  const candidates: BambuBuddyFolder[] = [];
  const visit = (items: BambuBuddyFolder[]) => {
    for (const item of items) {
      candidates.push(item);
      if (item.children) visit(item.children);
    }
  };
  visit(folders);
  return candidates.find((folder) => folder.parent_id === parentId && folder.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0);
}

export async function resolveBambuBuddyFolderHierarchy(client: BambuBuddyClient, rawNames: string[]) {
  const names = rawNames.map(normalizeBambuBuddyFolderName);
  let folders = await client.listFolders();
  let parentId: number | null = null;
  for (const name of names) {
    let folder = findChild(folders, parentId, name);
    if (!folder) {
      try {
        folder = await client.createFolder(name, parentId);
      } catch (error) {
        folders = await client.listFolders();
        folder = findChild(folders, parentId, name);
        if (!folder) throw error;
      }
      folders = await client.listFolders();
    }
    parentId = folder.id;
  }
  if (parentId === null) throw new Error("Unable to resolve a BambuBuddy folder.");
  return parentId;
}
