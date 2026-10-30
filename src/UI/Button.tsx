import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "danger";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const variants: Record<Variant | "default", string> = {
  default: "border border-border bg-card text-foreground hover:bg-muted",
  primary: "border border-primary bg-primary text-primary-foreground hover:bg-primary/90",
  danger: "border border-destructive text-destructive hover:bg-destructive/10",
};

/** The variant name doubles as a plain class so stylesheets can target `.primary` and `.danger`. */
export function Button({
  variant,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant | undefined }) {
  return (
    <button
      data-slot="button"
      type={type}
      className={[base, variants[variant ?? "default"], variant, className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
