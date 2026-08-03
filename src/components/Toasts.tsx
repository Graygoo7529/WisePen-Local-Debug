import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToastStore } from "../stores/toastStore";
import { cn } from "../lib/cn";

const icons = {
  success: <CheckCircle2 size={16} className="text-success" />,
  error: <AlertCircle size={16} className="text-danger" />,
  info: <Info size={16} className="text-info" />,
};

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[360px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-fade-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-bg-elev px-3.5 py-3 shadow-(--shadow-pop)",
          )}
        >
          <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
          <div className="min-w-0 flex-1 text-[13px] leading-5 break-words text-fg">{t.text}</div>
          <button
            className="shrink-0 cursor-pointer text-fg-faint hover:text-fg"
            onClick={() => dismiss(t.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
