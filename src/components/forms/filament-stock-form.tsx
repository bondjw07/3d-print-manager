"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FilamentStockFormProps = {
  filamentId: string;
  redirectTo: string;
  fullRollCount: number;
  partialRollGrams: number[];
  updateAction: (formData: FormData) => void | Promise<void>;
};

export function FilamentStockForm({
  filamentId,
  redirectTo,
  fullRollCount,
  partialRollGrams,
  updateAction,
}: FilamentStockFormProps) {
  const [partialRolls, setPartialRolls] = useState<string[]>(
    partialRollGrams.length > 0 ? partialRollGrams.map((grams) => grams.toString()) : [],
  );

  const partialRollSummary = useMemo(() => {
    const parsed = partialRolls
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);

    const totalGrams = parsed.reduce((sum, value) => sum + value, 0);

    return {
      count: parsed.length,
      totalGrams,
    };
  }, [partialRolls]);

  const updatePartialRoll = (index: number, value: string) => {
    setPartialRolls((previous) => previous.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
  };

  const removePartialRoll = (index: number) => {
    setPartialRolls((previous) => previous.filter((_, entryIndex) => entryIndex !== index));
  };

  const addPartialRoll = () => {
    setPartialRolls((previous) => [...previous, ""]);
  };

  return (
    <form action={updateAction} className="space-y-4">
      <input type="hidden" name="filamentId" value={filamentId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="fullRollCount">
          Full rolls on hand
        </label>
        <Input id="fullRollCount" name="fullRollCount" type="number" min={0} step={1} defaultValue={fullRollCount} required />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">Partial rolls</p>
          <Button type="button" size="sm" variant="secondary" onClick={addPartialRoll}>
            Add Partial Roll
          </Button>
        </div>

        {partialRolls.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
            No partial rolls tracked yet.
          </p>
        ) : (
          <div className="space-y-2">
            {partialRolls.map((grams, index) => (
              <div key={`partial-roll-${index}`} className="rounded-xl border border-slate-200 p-3">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor={`partial-roll-${index}`}>
                  Partial Roll {index + 1}
                </label>
                <div className="flex gap-2">
                  <Input
                    id={`partial-roll-${index}`}
                    name="partialRollGrams"
                    type="number"
                    min={0.01}
                    step={0.01}
                    placeholder="Grams remaining"
                    value={grams}
                    onChange={(event) => updatePartialRoll(index, event.currentTarget.value)}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removePartialRoll(index)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-500">
          Tracking {partialRollSummary.count} partial roll{partialRollSummary.count === 1 ? "" : "s"} totaling{" "}
          {partialRollSummary.totalGrams.toFixed(1)} g.
        </p>
      </div>

      <Button type="submit">Save Stock</Button>
    </form>
  );
}
