import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { Button as StyledButton } from "./Button";

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
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | undefined }) {
  return (
    <StyledButton
      variant={variant ?? "default"}
      className={`${variant ?? ""} ${className}`.trim()}
      {...props}
    />
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
