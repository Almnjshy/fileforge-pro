"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Save, FileDown, Search, Replace, Undo, Redo, FileText, Eye, Code, X,
  ChevronDown, ChevronUp, WrapText, RotateCcw,
} from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import { getNode, getExt } from "@/lib/fileforge/filesystem";
import { nativeFileSystem, isNative } from "@/lib/fileforge/native-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const EXT_LANG: Record<string, string> = {
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", java: "java", kt: "kotlin", kts: "kotlin", go: "go", rs: "rust",
  c: "c", cpp: "cpp", h: "c", sh: "bash", bash: "bash", sql: "sql",
  json: "json", yaml: "yaml", yml: "yaml", toml: "toml", xml: "xml", html: "html",
  htm: "html", css: "css", scss: "scss", md: "markdown", txt: "text", log: "text",
  conf: "ini", ini: "ini", csv: "csv",
};

const MAX_HISTORY = 100;
const HISTORY_DEBOUNCE_MS = 450;

function highlight(code: string, lang: string): { text: string; cls: string }[][] {
  return code.split("\n").map(line => highlightLine(line, lang));
}

function highlightLine(line: string, lang: string): { text: string; cls: string }[] {
  const tokens: { text: string; cls: string }[] = [];
  const push = (text: string, cls = "") => { if (text) tokens.push({ text, cls }); };
  const comment = line.match(/^(\s*)(#.*)$/);
  if (["python", "bash", "yaml", "toml", "ini"].includes(lang) && comment) {
    push(comment[1]); push(comment[2], "text-muted-foreground italic"); return tokens;
  }
  const slash = line.match(/^(\s*)(\/\/.*)$/);
  if (["javascript", "typescript", "c", "cpp", "java", "go", "rust", "css", "scss"].includes(lang) && slash) {
    push(slash[1]); push(slash[2], "text-muted-foreground italic"); return tokens;
  }
  const sqlComment = line.match(/^(\s*)(--.*)$/);
  if (lang === "sql" && sqlComment) {
    push(sqlComment[1]); push(sqlComment[2], "text-muted-foreground italic"); return tokens;
  }
  if (lang === "html" || lang === "xml") {
    const regex = /(<\/?[a-zA-Z][^>]*>)/g;
    let last = 0; let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > last) push(line.slice(last, match.index));
      push(match[0], "text-pink-600 dark:text-pink-400"); last = match.index + match[0].length;
    }
    if (last < line.length) push(line.slice(last));
    return tokens.length ? tokens : [{ text: line, cls: "" }];
  }
  const strings = /(["'`])(?:\\.|(?!\1).)*\1/g;
  let last = 0; let match: RegExpExecArray | null;
  while ((match = strings.exec(line)) !== null) {
    if (match.index > last) processKeywords(line.slice(last, match.index), push, lang);
    push(match[0], "text-emerald-600 dark:text-emerald-400"); last = match.index + match[0].length;
  }
  if (last < line.length) processKeywords(line.slice(last), push, lang);
  return tokens.length ? tokens : [{ text: line, cls: "" }];
}

function processKeywords(text: string, push: (s: string, cls?: string) => void, lang: string) {
  const KEYWORDS: Record<string, string[]> = {
    javascript: ["const","let","var","function","return","if","else","for","while","class","new","import","export","from","default","async","await","try","catch","throw","typeof","instanceof","this","null","undefined","true","false"],
    typescript: ["const","let","var","function","return","if","else","for","while","class","new","import","export","from","default","async","await","try","catch","throw","typeof","instanceof","this","null","undefined","true","false","interface","type","enum","extends","implements","public","private","protected","readonly","static"],
    python: ["def","class","import","from","as","if","elif","else","for","while","try","except","finally","return","yield","raise","with","lambda","pass","break","continue","in","is","not","and","or","None","True","False","self","global","nonlocal"],
    java: ["public","private","protected","class","interface","extends","implements","static","final","void","int","long","double","float","boolean","char","String","if","else","for","while","do","switch","case","break","continue","return","new","try","catch","finally","throw","throws","import","package","this","super","null","true","false"],
    go: ["package","import","func","var","const","type","struct","interface","if","else","for","switch","case","default","break","continue","return","go","defer","chan","map","range","make","new","nil","true","false"],
    rust: ["fn","let","mut","const","static","struct","enum","trait","impl","pub","private","if","else","for","while","loop","match","return","break","continue","use","mod","crate","self","super","as","ref","move","async","await","unsafe"],
    sql: ["SELECT","FROM","WHERE","INSERT","UPDATE","DELETE","CREATE","DROP","ALTER","TABLE","INDEX","VIEW","INTO","VALUES","SET","JOIN","LEFT","RIGHT","INNER","OUTER","ON","GROUP","BY","ORDER","HAVING","LIMIT","OFFSET","AS","AND","OR","NOT","NULL","PRIMARY","KEY","FOREIGN","REFERENCES","DEFAULT","UNIQUE","CASCADE"],
    bash: ["if","then","else","elif","fi","for","in","do","done","while","case","esac","function","return","exit","echo","export","local","readonly","source","alias"],
    css: ["color","background","border","margin","padding","display","position","top","left","right","bottom","width","height","font","text","align","justify","flex","grid","gap","cursor","transition","transform","animation"],
  };
  const keywords = KEYWORDS[lang] ?? [];
  const regex = /(\b\d+(?:\.\d+)?\b)|([a-zA-Z_$][a-zA-Z0-9_$]*)|(\s+)|([^\w\s])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) push(match[1], "text-amber-600 dark:text-amber-400");
    else if (match[2]) {
      if (keywords.includes(match[2])) push(match[2], "text-purple-600 dark:text-purple-400 font-medium");
      else if (match[2][0] === match[2][0].toUpperCase() && match[2] !== match[2].toLowerCase()) push(match[2], "text-sky-600 dark:text-sky-400");
      else push(match[2]);
    } else if (match[3]) push(match[3]);
    else push(match[4]);
  }
}

function countMatches(text: string, query: string): number {
  if (!query) return 0;
  let count = 0; let from = 0;
  while (from <= text.length) {
    const at = text.indexOf(query, from);
    if (at < 0) break;
    count++; from = at + Math.max(query.length, 1);
  }
  return count;
}

export function TextEditor({ nodeId }: { nodeId: string; winId: string }) {
  const store = useFileForge();
  const node = getNode(nodeId);
  const ext = node ? getExt(node.name) : "";
  const editorLang = EXT_LANG[ext] ?? "text";

  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [showHighlight, setShowHighlight] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const dirty = content !== originalContent;
  const highlightedLines = useMemo(() => highlight(content, editorLang), [content, editorLang]);
  const matchCount = useMemo(() => countMatches(content, searchQuery), [content, searchQuery]);

  const syncHistoryState = useCallback((items: string[], index: number) => {
    historyRef.current = items; historyIdxRef.current = index;
    setHistory(items); setHistoryIdx(index);
  }, []);

  const pushHistory = useCallback((value: string, force = false) => {
    const items = historyRef.current;
    const index = historyIdxRef.current;
    if (!force && items[index] === value) return;
    const next = items.slice(0, index + 1);
    next.push(value);
    while (next.length > MAX_HISTORY) next.shift();
    syncHistoryState(next, next.length - 1);
  }, [syncHistoryState]);

  const updateCursor = useCallback((target?: HTMLTextAreaElement) => {
    const ta = target ?? textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const parts = before.split("\n");
    setCursorPos({ line: parts.length, col: [...parts[parts.length - 1]].length + 1 });
  }, []);

  const loadContent = useCallback(async () => {
    if (!node) return;
    setLoading(true); setError(null);
    try {
      const value = isNative() ? await nativeFileSystem.readText(node.id) : (node.content ?? "");
      if (value == null) throw new Error("Unable to read file");
      if (!mountedRef.current) return;
      setContent(value); setOriginalContent(value); syncHistoryState([value], 0);
      requestAnimationFrame(() => updateCursor());
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message ?? "Failed to read file");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [node, syncHistoryState, updateCursor]);

  // File loading is an intentional async synchronization with the selected storage resource.
  // The loader owns its lifecycle/state guards; the effect only schedules that external read.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    mountedRef.current = true;
    const timer = window.setTimeout(() => { void loadContent(); }, 0);
    return () => {
      window.clearTimeout(timer);
      mountedRef.current = false;
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [loadContent]);

  const save = useCallback(async () => {
    if (!node || saving || !dirty) return;
    setSaving(true); setError(null);
    try {
      if (isNative()) {
        const ok = await nativeFileSystem.writeText(node.id, content);
        if (!ok) throw new Error("Failed to write file");
      }
      store.saveFileContent(node.id, content);
      setOriginalContent(content);
      store.addToast("File saved", "success");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save file");
      store.addToast("Failed to save file", "error");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [content, dirty, node, saving, store]);

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!dirty || readOnly) return;
    saveTimerRef.current = setTimeout(() => { void save(); }, 2500);
  }, [dirty, readOnly, save]);

  const handleChange = (value: string) => {
    if (readOnly) return;
    setContent(value);
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => pushHistory(value), HISTORY_DEBOUNCE_MS);
    scheduleAutosave();
    requestAnimationFrame(() => updateCursor());
  };

  const commitHistoryBeforeCommand = () => {
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    if (historyRef.current[historyIdxRef.current] !== content) pushHistory(content, true);
  };

  const restoreHistory = (index: number) => {
    const value = historyRef.current[index];
    if (value === undefined) return;
    syncHistoryState(historyRef.current, index);
    setContent(value);
    requestAnimationFrame(() => updateCursor());
    scheduleAutosave();
  };

  const undo = () => { if (!readOnly) { commitHistoryBeforeCommand(); const i = historyIdxRef.current; if (i > 0) restoreHistory(i - 1); } };
  const redo = () => { if (!readOnly) { commitHistoryBeforeCommand(); const i = historyIdxRef.current; if (i < historyRef.current.length - 1) restoreHistory(i + 1); } };

  const jumpToMatch = (direction: 1 | -1) => {
    if (!searchQuery || matchCount === 0) return;
    const next = (matchIndex + direction + matchCount) % matchCount;
    setMatchIndex(next);
    const ta = textareaRef.current;
    if (!ta) return;
    let from = 0;
    for (let i = 0; i < next; i++) {
      const at = content.indexOf(searchQuery, from);
      if (at < 0) return;
      from = at + Math.max(searchQuery.length, 1);
    }
    const at = content.indexOf(searchQuery, from);
    if (at < 0) return;
    ta.focus(); ta.setSelectionRange(at, at + searchQuery.length);
    updateCursor(ta);
  };

  const replaceAll = () => {
    if (!searchQuery || readOnly) return;
    const next = content.split(searchQuery).join(replaceQuery);
    if (next === content) return;
    commitHistoryBeforeCommand(); setContent(next); pushHistory(next, true); scheduleAutosave();
  };

  const saveAs = () => {
    if (!node) return;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = node.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
      else if (event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) { event.preventDefault(); redo(); }
      else if (event.key.toLowerCase() === "f") { event.preventDefault(); setSearchOpen(true); requestAnimationFrame(() => document.getElementById(`ff-find-${nodeId}`)?.focus()); }
      else if (event.key.toLowerCase() === "h") { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  if (!node) return <div className="p-4 text-sm">File not found</div>;
  if (loading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex min-h-9 shrink-0 items-center gap-1 border-b bg-muted/30 px-2">
        <Button variant="ghost" size="sm" className="h-7 gap-1.5" disabled={!dirty || saving || readOnly} onClick={() => void save()} title="Save (Ctrl/Cmd+S)">
          <Save className="h-3.5 w-3.5" /><span className="text-xs">{saving ? "Saving…" : "Save"}</span>{dirty && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={historyIdx <= 0 || readOnly} onClick={undo} title="Undo"><Undo className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={historyIdx >= history.length - 1 || readOnly} onClick={redo} title="Redo"><Redo className="h-3.5 w-3.5" /></Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSearchOpen(v => !v)} title="Find / Replace"><Search className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWrapLines(v => !v)} title="Toggle word wrap"><WrapText className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowLineNumbers(v => !v)} title="Line numbers"><FileText className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setReadOnly(v => !v)} title={readOnly ? "Switch to editing" : "Switch to read-only"}>{readOnly ? <Eye className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}{readOnly ? "Read only" : "Edit"}</Button>
        <Button variant="ghost" size="icon" className={cn("h-7 w-7", showHighlight && "bg-muted")} onClick={() => setShowHighlight(v => !v)} title="Syntax highlighting"><Code className="h-3.5 w-3.5" /></Button>
        <Badge variant="outline" className="ml-auto text-[10px] uppercase">{editorLang}</Badge>
      </div>

      {searchOpen && (
        <div className="flex shrink-0 items-center gap-1 border-b bg-muted/20 px-2 py-1.5">
          <Input id={`ff-find-${nodeId}`} autoComplete="off" dir="auto" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setMatchIndex(0); }} placeholder="Find…" className="h-7 min-w-0 flex-1 text-xs" />
          <span className="min-w-[55px] text-center text-[10px] text-muted-foreground">{matchCount ? `${matchIndex + 1}/${matchCount}` : "0/0"}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!matchCount} onClick={() => jumpToMatch(-1)} title="Previous"><ChevronUp className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!matchCount} onClick={() => jumpToMatch(1)} title="Next"><ChevronDown className="h-3.5 w-3.5" /></Button>
          <Input autoComplete="off" dir="auto" value={replaceQuery} onChange={e => setReplaceQuery(e.target.value)} placeholder="Replace…" className="h-7 min-w-0 flex-1 text-xs" />
          <Button variant="ghost" size="sm" className="h-7" disabled={!searchQuery || readOnly} onClick={replaceAll}><Replace className="mr-1 h-3.5 w-3.5" />All</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSearchOpen(false)}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1 text-xs text-destructive"><span className="flex-1">{error}</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setError(null)}><X className="h-3 w-3" /></Button></div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden font-mono text-sm">
        {showLineNumbers && (
          <div className="w-12 shrink-0 overflow-hidden border-r bg-muted/20 py-2 text-right text-xs leading-5 text-muted-foreground/60 select-none" aria-hidden>
            {content.split("\n").map((_, i) => <div key={i} className="px-2 leading-5">{i + 1}</div>)}
          </div>
        )}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {showHighlight && readOnly ? (
            <pre className={cn("absolute inset-0 m-0 overflow-auto p-2 leading-5", wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre")} dir="auto" style={{ unicodeBidi: "plaintext", textAlign: "start" }} aria-label="Highlighted document">
              {highlightedLines.map((line, i) => <div key={i} className="min-h-5">{line.map((tok, j) => <span key={j} className={tok.cls}>{tok.text}</span>)}{line.length === 0 && "\u00a0"}</div>)}
            </pre>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => handleChange(e.target.value)}
              onSelect={e => updateCursor(e.currentTarget)}
              onClick={e => updateCursor(e.currentTarget)}
              dir="auto"
              lang="und"
              readOnly={readOnly}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              inputMode="text"
              wrap={wrapLines ? "soft" : "off"}
              className={cn("absolute inset-0 h-full w-full resize-none border-0 bg-transparent p-2 leading-5 outline-none", wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre overflow-x-auto")}
              style={{ direction: "ltr", unicodeBidi: "plaintext", textAlign: "start", writingMode: "horizontal-tb" }}
              aria-label={`Text editor for ${node.name}`}
            />
          )}
        </div>
      </div>

      <div className="flex h-6 shrink-0 items-center gap-3 border-t bg-muted/20 px-3 text-[10px] text-muted-foreground">
        <span>Ln {cursorPos.line}, Col {cursorPos.col}</span><span>·</span><span>{content.length} chars</span><span>·</span><span>{content.split("\n").length} lines</span><span>·</span><span>UTF-8</span><div className="flex-1" />
        {dirty && <span className="font-medium text-orange-500">Modified</span>}{readOnly && <span className="text-orange-500">Read Only</span>}
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => void loadContent()} title="Reload from disk"><RotateCcw className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={saveAs} title="Save as"><FileDown className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}
