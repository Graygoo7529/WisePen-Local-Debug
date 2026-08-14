import { useState } from "react";
import { X } from "lucide-react";

export function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");

  const commit = () => {
    const next = text.trim().replace(/,+$/, "");
    if (next && !value.includes(next)) onChange([...value, next]);
    setText("");
  };

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-bg-elev px-2 py-1.5 focus-within:border-accent">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-bg-hover px-1.5 py-0.5 font-mono text-xs text-fg"
        >
          {tag}
          <button
            type="button"
            className="cursor-pointer text-fg-faint hover:text-danger"
            disabled={disabled}
            onClick={() => onChange(value.filter((item) => item !== tag))}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-fg-faint"
        value={text}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : ""}
        onChange={(event) => {
          if (event.target.value.includes(",")) {
            const parts = event.target.value.split(",");
            const additions = parts.slice(0, -1).map((part) => part.trim()).filter(Boolean);
            if (additions.length > 0) onChange([...new Set([...value, ...additions])]);
            setText(parts[parts.length - 1]);
          } else {
            setText(event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Backspace" && text === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}
