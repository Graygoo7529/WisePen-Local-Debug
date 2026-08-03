import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";

// ============ Button ============
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-strong active:bg-accent-strong shadow-sm disabled:bg-accent/50",
  secondary:
    "bg-bg-hover text-fg hover:bg-line active:bg-line-strong disabled:opacity-50",
  ghost: "text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-50",
  danger: "bg-danger-soft text-danger hover:bg-danger/20 disabled:opacity-50",
  outline:
    "border border-line-strong text-fg hover:bg-bg-hover disabled:opacity-50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "xs" | "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  const sizes = {
    xs: "h-7 px-2 text-xs gap-1 rounded-md",
    sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
    md: "h-9 px-4 text-sm gap-2 rounded-lg",
  };
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center font-medium transition-colors select-none disabled:cursor-not-allowed",
        sizes[size],
        buttonVariants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={size === "xs" ? 12 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  className,
  title,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ============ Card / Section ============
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-line bg-bg-elev", className)}>{children}</div>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{title}</div>
            {description && <div className="mt-0.5 text-xs text-fg-muted">{description}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

// ============ 表单控件 ============
const controlBase =
  "w-full rounded-lg border border-line bg-bg-elev text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(controlBase, "h-9 px-3", className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(controlBase, "min-h-[80px] px-3 py-2 leading-relaxed", className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: ReactNode; disabled?: boolean }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, className, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(controlBase, "h-9 cursor-pointer px-2 pr-8", className)} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
});

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <div className="mb-1.5 text-[13px] font-medium text-fg-muted">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-fg-faint">{hint}</div>}
    </label>
  );
}

// ============ Badge ============
export type BadgeTone = "gray" | "green" | "red" | "yellow" | "blue" | "accent";

const badgeTones: Record<BadgeTone, string> = {
  gray: "bg-bg-hover text-fg-muted",
  green: "bg-success-soft text-success",
  red: "bg-danger-soft text-danger",
  yellow: "bg-warning-soft text-warning",
  blue: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
};

export function Badge({
  tone = "gray",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ============ 状态展示 ============
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn("animate-spin text-fg-faint", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="mb-1 text-fg-faint">{icon}</div>}
      <div className="text-sm font-medium text-fg-muted">{title}</div>
      {description && <div className="max-w-[380px] text-xs leading-5 text-fg-faint">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-fg">{title}</h1>
        {description && <p className="mt-1 text-[13px] leading-5 text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ============ Tabs ============
export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: Array<{ key: string; label: ReactNode }>;
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-lg bg-bg-sunken p-0.5", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
            active === t.key
              ? "bg-bg-elev text-fg shadow-sm"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ============ 复制按钮 ============
export function CopyButton({
  text,
  title = "复制",
  className,
}: {
  text: string;
  title?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      title={copied ? "已复制" : title}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          /* 剪贴板不可用时静默 */
        }
      }}
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </IconButton>
  );
}
