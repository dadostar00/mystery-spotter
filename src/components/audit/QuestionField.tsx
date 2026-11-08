import { Camera, Check, X } from "lucide-react";
import { useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Answers, Question } from "@/domain/questionnaire";
import { PROD_NESSUNO } from "@/domain/questionnaire";
import { cn } from "@/lib/utils";

interface Props {
  question: Question;
  value: unknown;
  onChange: (v: unknown) => void;
  answers: Answers;
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {selected && <Check className="h-4 w-4 shrink-0" />}
      {label}
    </button>
  );
}

export function QuestionField({ question, value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border-b border-border/70 py-4 last:border-b-0">
      <p className="mb-3 text-sm font-medium leading-snug text-foreground">{question.label}</p>

      {question.kind === "single" && (
        <Select
          value={(value as string) ?? ""}
          onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
        >
          <SelectTrigger className="min-h-11 w-full rounded-xl border-input bg-card text-sm">
            <SelectValue placeholder="Seleziona una risposta" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {question.options?.map((o) => (
              <SelectItem key={o} value={o} className="text-sm">
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {question.kind === "multi" && (
        <div className="flex flex-wrap gap-2">
          {question.options?.map((o) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            const sel = arr.includes(o);
            const handleToggle = () => {
              if (sel) {
                onChange(arr.filter((x) => x !== o));
                return;
              }
              if (o === PROD_NESSUNO) {
                onChange([PROD_NESSUNO]);
                return;
              }
              onChange([...arr.filter((x) => x !== PROD_NESSUNO), o]);
            };
            return <Chip key={o} label={o} selected={sel} onClick={handleToggle} />;
          })}
        </div>
      )}

      {(question.kind === "text" || question.kind === "number") && (
        <input
          type={question.kind === "number" ? "number" : "text"}
          inputMode={question.kind === "number" ? "decimal" : "text"}
          value={(value as string) ?? ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      )}

      {question.kind === "textarea" && (
        <textarea
          rows={5}
          value={(value as string) ?? ""}
          placeholder="Scrivi qui la tua osservazione…"
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-y rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      )}

      {question.kind === "photo" && (
        <div className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => onChange(reader.result as string);
              reader.readAsDataURL(f);
            }}
          />
          {typeof value === "string" && value.startsWith("data:image") ? (
            <div className="relative w-40 overflow-hidden rounded-xl border border-border">
              <img src={value} alt={question.label} className="h-40 w-40 object-cover" />
              <button
                type="button"
                onClick={() => onChange(undefined)}
                aria-label="Rimuovi foto"
                className="absolute right-1 top-1 rounded-full bg-foreground/70 p-1 text-background"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-secondary px-5 text-sm font-medium text-secondary-foreground"
            >
              <Camera className="h-4 w-4" />
              Scatta o carica foto
            </button>
          )}
        </div>
      )}
    </div>
  );
}
