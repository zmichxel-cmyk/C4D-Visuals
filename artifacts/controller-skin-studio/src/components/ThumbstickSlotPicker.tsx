import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { StickEntry } from "./SkinPanel";

// Same card pattern as BezelSlotPicker — a thumbnail, current name, and a
// "Change" button that expands an inline material grid right there, instead
// of opening a separate library popover/modal.

interface Props {
  label: string;
  value: string | null;
  entries: StickEntry[];
  onSelect: (url: string) => void;
  /** Reports open/closed so the editor can show its fade only while a picker is open. */
  onPickerOpenChange?: (open: boolean) => void;
}

export function ThumbstickSlotPicker({ label, value, entries, onSelect, onPickerOpenChange }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    onPickerOpenChange?.(true);
    return () => onPickerOpenChange?.(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = entries.find(e => e.url === value);

  return (
    <div className="border border-border rounded-lg bg-background/60 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        {/* object-contain, not object-cover — these renders aren't perfectly
            square (the stick cap/rim highlight extends slightly above the
            main circle), so cover was cropping the top off some of them. */}
        <div className="w-12 h-12 rounded border border-border bg-[#1a1a22] flex-none overflow-hidden">
          {value && <img src={value} alt={label} className="w-full h-full object-contain" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
          <p className="text-xs font-medium truncate">{current?.name ?? "Custom"}</p>
        </div>
        {open ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setOpen(false)}
              aria-label="Back"
              className="p-1.5 rounded-md border border-primary text-primary hover:bg-primary/15 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              disabled
              className="text-[11px] px-2.5 py-1.5 rounded-md border border-border text-muted-foreground/40 cursor-not-allowed"
            >
              Change
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="text-[11px] px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
          >
            Change
          </button>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-3 gap-1.5 p-1.5 border border-border rounded-lg">
          {entries.map(e => (
            <button key={e.id} onClick={() => { onSelect(e.url); setOpen(false); }}
              className={`flex flex-col items-center gap-1 p-1.5 rounded border transition-all ${e.url === value ? "border-primary" : "border-border hover:border-primary/50"}`}>
              <img src={e.url} alt={e.name} className="w-11 h-11 object-contain rounded" />
              <span className="text-[10px] text-muted-foreground text-center leading-tight">{e.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
