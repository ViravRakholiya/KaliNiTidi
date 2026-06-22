import { useStore } from "../store.js";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div id="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + (t.kind || "")}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function Reveal() {
  const reveal = useStore((s) => s.reveal);
  if (!reveal) return null;
  return (
    <div className="reveal" key={reveal.id}>
      <div className="big">{reveal.title}</div>
      <div className="nm">{reveal.subtitle}</div>
    </div>
  );
}
