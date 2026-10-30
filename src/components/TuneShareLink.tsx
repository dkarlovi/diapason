import { Button } from "../UI/Primitives";
export function TuneShareLink({
  link,
  onClose,
  floating = false,
}: {
  link: string | null;
  onClose(): void;
  floating?: boolean;
}) {
  if (!link) return null;
  return (
    <div
      className={floating ? "tune-share-link tune-share-floating" : "tune-share-link"}
      role={floating ? "dialog" : "group"}
      aria-label="Copy tune link"
    >
      <label>
        Copy tune link
        <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <Button onClick={onClose}>Close link</Button>
    </div>
  );
}
