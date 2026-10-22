import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { Link } from "react-router";

export function Panel({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Button({
  variant,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" }) {
  return <button className={`${variant ?? ""} ${className}`.trim()} {...props} />;
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

export function Breadcrumb({ current }: { current: string }) {
  return (
    <p className="step">
      <Link to="/">← Library</Link> · {current}
    </p>
  );
}
