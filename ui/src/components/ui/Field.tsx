import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { clsx } from "../../lib/cx";

const CONTROL_CLASSES =
  "w-full rounded-btn border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-4 outline-none focus:border-primary";

export function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[12.5px] font-medium text-ink-2"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] text-ink-4">{hint}</p>}
    </div>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(CONTROL_CLASSES, "h-[38px]", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(CONTROL_CLASSES, "py-2.5 leading-normal", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(CONTROL_CLASSES, "h-[38px] appearance-none pr-8", className)}
      {...props}
    >
      {children}
    </select>
  );
}
