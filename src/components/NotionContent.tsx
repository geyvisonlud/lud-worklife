import type { Seg, SimpleBlock } from "@/lib/notion";

function Text({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) => {
        let node: React.ReactNode = s.t;
        if (s.m === "user")
          node = (
            <span className={`rounded-[5px] px-1 font-medium ${s.me ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2"}`}>{s.t.startsWith("@") ? s.t : `@${s.t}`}</span>
          );
        if (s.c) node = <code className="rounded-[4px] bg-surface-2 px-1 py-[1px] font-mono text-[0.88em]">{node}</code>;
        if (s.b) node = <strong className="font-semibold">{node}</strong>;
        if (s.i) node = <em>{node}</em>;
        if (s.s) node = <s>{node}</s>;
        if (s.h)
          node = (
            <a href={s.h} target="_blank" rel="noreferrer" className="text-accent underline decoration-[var(--hairline-strong)] underline-offset-2">
              {node}
            </a>
          );
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/** Read-only render of a Notion page snapshot. Mentions of you are highlighted. */
export function NotionContent({ blocks }: { blocks: SimpleBlock[] }) {
  return <div className="space-y-1.5 text-[14.5px] leading-[1.6]">{render(blocks)}</div>;
}

function render(blocks: SimpleBlock[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let olCount = 0;
  for (const b of blocks) {
    olCount = b.type === "ol" ? olCount + 1 : 0;
    const kids = b.children?.length ? <div className="ml-5 mt-1 space-y-1">{render(b.children)}</div> : null;
    switch (b.type) {
      case "h1":
        out.push(<h2 key={b.id} className="pt-3 text-[21px] font-semibold tracking-[-0.02em]"><Text segs={b.text} /></h2>);
        break;
      case "h2":
        out.push(<h3 key={b.id} className="pt-3 text-[17px] font-semibold tracking-[-0.01em]"><Text segs={b.text} /></h3>);
        break;
      case "h3":
        out.push(<h4 key={b.id} className="pt-2 text-[15px] font-semibold"><Text segs={b.text} /></h4>);
        break;
      case "ul":
        out.push(<div key={b.id} className="flex gap-2"><span className="select-none text-ink-3">•</span><div className="min-w-0 flex-1"><Text segs={b.text} />{kids}</div></div>);
        break;
      case "ol":
        out.push(<div key={b.id} className="flex gap-2"><span className="num select-none text-ink-3">{olCount}.</span><div className="min-w-0 flex-1"><Text segs={b.text} />{kids}</div></div>);
        break;
      case "todo":
        out.push(
          <div key={b.id} className="flex items-start gap-2">
            <span className={`mt-[5px] inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] ${b.checked ? "bg-accent" : "border-[1.5px] border-[var(--ink-3)]"}`} aria-label={b.checked ? "Done" : "Not done"}>
              {b.checked && <svg viewBox="0 0 16 16" width="10" height="10"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
            <div className={`min-w-0 flex-1 ${b.checked ? "text-ink-3 line-through" : ""}`}><Text segs={b.text} />{kids}</div>
          </div>,
        );
        break;
      case "toggle":
        out.push(<details key={b.id}><summary className="cursor-pointer"><Text segs={b.text} /></summary>{kids}</details>);
        break;
      case "quote":
        out.push(<blockquote key={b.id} className="border-l-[3px] border-[var(--ink)] pl-3"><Text segs={b.text} />{kids}</blockquote>);
        break;
      case "callout":
        out.push(<div key={b.id} className="flex gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3">{b.icon && <span>{b.icon}</span>}<div className="min-w-0 flex-1"><Text segs={b.text} />{kids}</div></div>);
        break;
      case "code":
        out.push(<pre key={b.id} className="overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-[12.5px]"><Text segs={b.text} /></pre>);
        break;
      case "divider":
        out.push(<hr key={b.id} className="my-3 border-hairline" />);
        break;
      case "child":
        out.push(<div key={b.id} className="flex items-center gap-2 text-ink-2"><span>{b.icon}</span><span className="underline decoration-[var(--hairline-strong)] underline-offset-2"><Text segs={b.text} /></span></div>);
        break;
      case "media":
        out.push(<div key={b.id} className="rounded-lg border border-dashed border-hairline px-3 py-2 text-[13px] text-ink-3"><Text segs={b.text} /></div>);
        break;
      default:
        out.push(<p key={b.id} className="min-h-[1em]"><Text segs={b.text} />{kids}</p>);
    }
  }
  return out;
}
