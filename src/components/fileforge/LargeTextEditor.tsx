"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Redo, Save, Search, Undo, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getNode, getExt, formatBytes } from "@/lib/fileforge/filesystem";
import { fileRepository } from "@/lib/fileforge/file-repository";
import { LargeDocumentEngine } from "@/lib/fileforge/large-document-engine";
import { nativeFileSystem } from "@/lib/fileforge/native-bridge";

const LANG: Record<string, string> = {
  txt: "text", log: "text", md: "markdown", json: "json", js: "javascript",
  ts: "typescript", tsx: "typescript", jsx: "javascript", py: "python",
  kt: "kotlin", java: "java", rs: "rust", go: "go", html: "html", htm: "html",
  css: "css", xml: "xml", yaml: "yaml", yml: "yaml",
};

const MAX_AUTOSAVE_DELAY = 2500;

export function LargeTextEditor({ nodeId }: { nodeId: string; winId: string }) {
  const node = getNode(nodeId);
  const [engine, setEngine] = useState<LargeDocumentEngine | null>(null);
  const [page, setPage] = useState(0);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(true);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPageUpdate = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const meta = await fileRepository.getMetadata(nodeId);
        if (!meta) throw new Error("File metadata unavailable");
        const opened = await LargeDocumentEngine.open(nodeId, meta.size);
        const first = await opened.getPageText(0);
        if (cancelled) return;
        setEngine(opened);
        setText(first);
        setPage(0);
        setDirty(false);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unable to open large document");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [nodeId]);

  const pageCount = engine?.pageCount ?? 0;
  const ext = node ? getExt(node.name) : "";
  const lang = LANG[ext] ?? "text";
  const lines = useMemo(() => text.split("\n"), [text]);
  const matches = useMemo(() => {
    if (!query) return [] as number[];
    const out: number[] = [];
    const haystack = text.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    let at = 0;
    while ((at = haystack.indexOf(needle, at)) !== -1 && out.length < 1000) {
      out.push(at);
      at += Math.max(needle.length, 1);
    }
    return out;
  }, [query, text]);

  function updateCursor() {
    const ta = textareaRef.current;
    if (!ta) return;
    const before = text.slice(0, ta.selectionStart);
    const lineParts = before.split("\n");
    setCursor({ line: lineParts.length, column: lineParts[lineParts.length - 1].length + 1 });
  }

  async function loadPage(next: number) {
    if (!engine || next < 0 || next >= engine.pageCount || next === page) return;
    if (dirty) {
      setError("Save the current changes before changing pages.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setText(await engine.getPageText(next));
      setPage(next);
      setMatchCount(0);
    } catch (e: any) {
      setError(e?.message ?? "Unable to load document page");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!engine || saving || !dirty) return;
    try {
      setSaving(true);
      setSaveProgress(0);
      setError(null);
      if (pendingPageUpdate.current) await pendingPageUpdate.current;
      await engine.save(progress => setSaveProgress(Math.round(progress * 100)));
      setDirty(false);
    } catch (e: any) {
      setError(e?.message ?? "Unable to save document");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty || readOnly || saving) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    // Autosave is a real transactional save, never a browser/localStorage draft.
    autosaveTimer.current = setTimeout(() => { void save(); }, MAX_AUTOSAVE_DELAY);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [text, dirty, readOnly, saving]);

  function changeText(value: string) {
    if (readOnly) return;
    setText(value);
    setDirty(true);
    pendingPageUpdate.current = engine?.updatePage(page, value) ?? null;
    window.setTimeout(updateCursor, 0);
  }

  async function undo() {
    if (!engine || readOnly) return;
    if (pendingPageUpdate.current) await pendingPageUpdate.current;
    const next = await engine.undoPage(page);
    setText(next);
    setDirty(true);
  }

  async function redo() {
    if (!engine || readOnly) return;
    if (pendingPageUpdate.current) await pendingPageUpdate.current;
    const next = await engine.redoPage(page);
    setText(next);
    setDirty(true);
  }

  function replaceAllOnPage() {
    if (!query || readOnly) return;
    const next = text.split(query).join(replace);
    if (next !== text) changeText(next);
  }

  if (loading && !engine) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading large document…</div>;
  }
  if (error && !engine) {
    return <div className="p-4 text-sm text-destructive">{error}</div>;
  }
  if (!engine) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background font-mono text-sm">
      <div className="flex min-h-9 items-center gap-1 border-b bg-muted/30 px-2">
        <Button variant="ghost" size="sm" className="h-7 gap-1" disabled={!dirty || saving || readOnly} onClick={save}>
          <Save className="h-3.5 w-3.5" />
          <span className="text-xs">{saving ? `Saving ${saveProgress}%` : "Save"}</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!engine.canUndo(page) || readOnly} onClick={() => void undo()} title="Undo">
          <Undo className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!engine.canRedo(page) || readOnly} onClick={() => void redo()} title="Redo">
          <Redo className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLineNumbers(v => !v)} title="Line numbers">#</Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => setReadOnly(v => !v)}>{readOnly ? "Read only" : "Editable"}</Button>
        <div className="flex-1 truncate text-[10px] text-muted-foreground">{formatBytes(engine.fileSize)} · {engine.encodingName} · {lang}</div>
        <Input value={query} onChange={e => setQuery(e.target.value)} dir="auto" placeholder="Find" className="h-7 w-28 text-xs" />
        <Input value={replace} onChange={e => setReplace(e.target.value)} dir="auto" placeholder="Replace" className="h-7 w-28 text-xs" />
        <Button variant="ghost" size="sm" className="h-7" disabled={!query || readOnly} onClick={replaceAllOnPage}>Replace all</Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b px-3 py-1 text-xs text-destructive">
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setError(null)}><X className="h-3 w-3" /></Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {lineNumbers && (
          <div className="w-12 shrink-0 overflow-hidden border-r bg-muted/20 py-2 text-right text-xs leading-5 text-muted-foreground/50 select-none">
            {lines.map((_, i) => <div key={i} className="px-2">{i + 1}</div>)}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          readOnly={readOnly}
          spellCheck={false}
          onChange={e => changeText(e.target.value)}
          onClick={updateCursor}
          onKeyUp={updateCursor}
          dir="auto"
          lang="und"
          style={{ unicodeBidi: "plaintext", textAlign: "start", direction: "ltr" }}
          className="min-h-0 min-w-0 flex-1 resize-none overflow-auto border-0 bg-transparent p-2 leading-5 outline-none"
          aria-label="Large text editor"
        />
      </div>

      <div className="flex min-h-7 items-center gap-2 border-t bg-muted/20 px-2 text-[10px] text-muted-foreground">
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page <= 0 || dirty || loading} onClick={() => void loadPage(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
        <span>Page {page + 1} / {pageCount}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={page >= pageCount - 1 || dirty || loading} onClick={() => void loadPage(page + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
        <span>·</span><span>Ln {cursor.line}, Col {cursor.column}</span>
        <span>·</span><span>{lines.length.toLocaleString()} lines</span>
        {query && <><span>·</span><span>{matches.length} matches on page</span></>}
        <span className="ml-auto">{dirty ? "Modified" : "Saved"}</span>
      </div>
    </div>
  );
}
