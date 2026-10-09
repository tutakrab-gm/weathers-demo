"use client";
import { useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "assistant"; content: string }
const SUGGEST = ["สรุปสถานการณ์ทุกโครงการตอนนี้", "โครงการไหนเลยรอบรายงานบ้าง", "สถานการณ์ NBR01 เทียบกับสถานีเจ้าพระยา", "สถานีวัดน้ำใดใกล้ระดับตลิ่ง"];

/** เรนเดอร์ markdown แบบเบา (ตัวหนา/ตัวเอียง/รายการ) โดยไม่ใช้ innerHTML */
function Md({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((ln, i) => {
        const bullet = /^\s*[-•]\s+/.test(ln);
        const parts = ln.replace(/^\s*[-•]\s+/, "").split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((t, j) =>
          t.startsWith("**") ? <b key={j}>{t.slice(2, -2)}</b> : t.startsWith("_") && t.endsWith("_") && t.length > 2 ? <i key={j} className="text-slate-500">{t.slice(1, -1)}</i> : <span key={j}>{t}</span>);
        return <div key={i} className={bullet ? "ml-4 list-item list-disc" : ""} style={{ minHeight: ln ? undefined : "0.5em" }}>{parts}</div>;
      })}
    </div>
  );
}

export function ChatClient() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, tool]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text.trim() }];
    setMsgs([...next, { role: "assistant", content: "" }]); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? "ส่งไม่สำเร็จ"); }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5));
          if (ev.type === "text") { setTool(null); setMsgs((m) => m.map((x, j) => (j === m.length - 1 ? { ...x, content: x.content + ev.text } : x))); }
          else if (ev.type === "tool") setTool(ev.name);
          else if (ev.type === "error") setMsgs((m) => m.map((x, j) => (j === m.length - 1 ? { ...x, content: x.content + `\n⚠️ ${ev.message}` } : x)));
        }
      }
    } catch (e) { setMsgs((m) => m.map((x, j) => (j === m.length - 1 ? { ...x, content: `⚠️ ${(e as Error).message}` } : x))); }
    setBusy(false); setTool(null);
  }

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] flex-col md:h-[calc(100dvh-8rem)]">
      <div className="flex-1 space-y-3 overflow-y-auto pb-2" aria-live="polite">
        {msgs.length === 0 && (
          <div className="space-y-3 py-6 text-center">
            <div className="text-4xl">💬</div><p className="text-slate-600">ถามเกี่ยวกับสถานการณ์น้ำของโครงการและข้อมูลหน่วยงานกลางได้เลย</p>
            <div className="mx-auto grid max-w-md gap-2">{SUGGEST.map((s) => <button key={s} className="btn-ghost justify-start text-left" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm md:max-w-[75%] ${m.role === "user" ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200"}`}>
              {m.role === "assistant" ? (m.content ? <Md text={m.content} /> : <span className="text-slate-400">{tool ? `กำลังดึงข้อมูล (${tool})…` : "กำลังคิด…"}</span>) : m.content}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 pt-2">
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="พิมพ์คำถาม…" aria-label="คำถาม" maxLength={2000} />
        <button className="btn-primary" disabled={busy || !input.trim()}>ส่ง</button>
      </form>
    </div>
  );
}
