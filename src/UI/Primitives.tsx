import type { PropsWithChildren } from "react";

export function Panel({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: PropsWithChildren<{ label: string; htmlFor: string }>) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
