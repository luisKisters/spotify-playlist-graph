"use client";

import { useState } from "react";

export function Collapsible({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="flex items-center">
        <button
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-zinc-100"
        >
          <svg
            viewBox="0 0 16 16"
            className={`h-3.5 w-3.5 text-zinc-500 transition ${open ? "" : "-rotate-90"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
          {title}
        </button>
        {right}
      </div>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => (step < 1 ? v.toFixed(2) : String(v)),
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  return (
    <label className="block" title={hint}>
      <span className="text-[13px] text-zinc-300">{label}</span>
      <span className="mt-1 flex items-center gap-3">
        <span className="w-12 shrink-0 text-xs tabular-nums text-zinc-400">{format(value)}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="slider min-w-0 flex-1"
          style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
        />
      </span>
    </label>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between text-[13px] text-zinc-300"
      role="switch"
      aria-checked={value}
    >
      {label}
      <span className={`relative h-5 w-9 rounded-full transition ${value ? "bg-accent" : "bg-white/15"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            value ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  full,
}: {
  options: { id: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  full?: boolean;
}) {
  return (
    <div className={`flex rounded-md bg-raised p-0.5 text-xs ${full ? "w-full" : ""}`}>
      {options.map((o) => (
        <button
          key={o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded px-2.5 py-1 font-medium transition ${
            value === o.id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  primary,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
        primary ? "bg-accent text-black hover:bg-accent-strong" : "bg-raised text-zinc-200 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
