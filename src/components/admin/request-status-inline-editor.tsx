"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { humanizeEnum, requestStatusOptions } from "@/lib/domain";
import { updateRequestByAdminAction } from "@/server/actions/portal-actions";
import type { RequestStatus } from "@/generated/prisma/enums";

type RequestStatusInlineEditorProps = {
  requestId: string;
  currentStatus: RequestStatus;
  adminNotes: string | null;
  redirectTo: string;
};

export function RequestStatusInlineEditor({
  requestId,
  currentStatus,
  adminNotes,
  redirectTo,
}: RequestStatusInlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftStatus, setDraftStatus] = useState<RequestStatus>(currentStatus);

  const beginEdit = () => {
    setDraftStatus(currentStatus);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraftStatus(currentStatus);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="group/status inline-flex items-center gap-1">
        <StatusBadge value={currentStatus} />
        <button
          type="button"
          aria-label="Edit request status"
          title="Edit status"
          onClick={beginEdit}
          className="pointer-events-none rounded-md border border-transparent p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-900 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 group-hover/status:pointer-events-auto group-hover/status:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <form action={updateRequestByAdminAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <input type="hidden" name="adminNotes" value={adminNotes ?? ""} />
      <Select
        name="status"
        value={draftStatus}
        onChange={(event) => setDraftStatus(event.target.value as RequestStatus)}
        className="h-8 min-w-[150px] rounded-lg px-2 text-xs"
      >
        {requestStatusOptions.map((status) => (
          <option key={status} value={status}>
            {humanizeEnum(status)}
          </option>
        ))}
      </Select>
      <button
        type="submit"
        aria-label="Save request status"
        title="Save"
        className="rounded-md border border-emerald-300 bg-emerald-50 p-1 text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Cancel request status edit"
        title="Cancel"
        onClick={cancelEdit}
        className="rounded-md border border-rose-300 bg-rose-50 p-1 text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
