export interface TraceFrame {
  line: number;
  locals: Record<string, string>;
  event: string;
}

let pyodide: PyodideInterface | null = null;
let loading: Promise<PyodideInterface> | null = null;

const TRACE_HELPER = `
import sys
import json

_defend_trace = []
_defend_skip = {"__name__", "__doc__", "__package__", "__loader__", "__spec__",
                "__annotations__", "__builtins__", "_defend_trace", "_defend_skip",
                "sys", "json"}

def _defend_tracer(frame, event, arg):
    if event not in ("line", "return", "call"):
        return _defend_tracer
    if frame.f_code.co_filename != "<user>":
        return _defend_tracer
    locs = {}
    for k, v in frame.f_locals.items():
        if k in _defend_skip or k.startswith("_defend"):
            continue
        try:
            locs[k] = repr(v)[:120]
        except Exception:
            locs[k] = "<unrepr>"
    _defend_trace.append({
        "line": frame.f_lineno,
        "locals": locs,
        "event": event,
    })
    if len(_defend_trace) > 500:
        sys.settrace(None)
    return _defend_tracer
`;

export async function loadPyodideOnce(): Promise<PyodideInterface> {
  if (pyodide) return pyodide;
  if (loading) return loading;
  loading = (async () => {
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Pyodide"));
        document.head.appendChild(s);
      });
    }
    pyodide = await window.loadPyodide!({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
    });
    return pyodide;
  })();
  return loading;
}

export interface RunResult {
  ok: boolean;
  stdout: string;
  error?: string;
  needsServer?: boolean;
  frames: TraceFrame[];
}

export async function runWithTrace(code: string): Promise<RunResult> {
  const py = await loadPyodideOnce();
  let stdout = "";
  py.setStdout({ batched: (t) => (stdout += t + "\n") });
  py.setStderr({ batched: (t) => (stdout += t + "\n") });
  try {
    await py.runPythonAsync(TRACE_HELPER);
    await py.runPythonAsync(`
import sys
_defend_trace.clear()
sys.settrace(_defend_tracer)
_code = compile(${JSON.stringify(code)}, "<user>", "exec")
try:
    exec(_code, {"__name__": "__main__"})
finally:
    sys.settrace(None)
`);
    const raw = await py.runPythonAsync("json.dumps(_defend_trace)");
    return { ok: true, stdout: stdout.trim(), frames: JSON.parse(String(raw)) as TraceFrame[] };
  } catch (err) {
    const msg = String(err);
    return {
      ok: false,
      stdout: stdout.trim(),
      error: msg,
      needsServer: /ModuleNotFoundError|No module named|cannot import/i.test(msg),
      frames: [],
    };
  }
}

export class Playback {
  frames: TraceFrame[] = [];
  index = 0;
  playing = false;
  private timer: number | null = null;
  onUpdate: ((frame: TraceFrame | null, index: number) => void) | null = null;

  load(frames: TraceFrame[]): void {
    this.stop();
    this.frames = frames.filter((f) => f.event === "line" || f.event === "return");
    this.index = 0;
    this.emit();
  }

  play(): void {
    if (!this.frames.length) return;
    this.playing = true;
    this.tick();
  }

  pause(): void {
    this.playing = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  stop(): void {
    this.pause();
    this.index = 0;
    this.emit();
  }

  stepForward(): void {
    this.pause();
    if (this.index < this.frames.length - 1) {
      this.index += 1;
      this.emit();
    }
  }

  stepBack(): void {
    this.pause();
    if (this.index > 0) {
      this.index -= 1;
      this.emit();
    }
  }

  seek(i: number): void {
    this.pause();
    this.index = Math.max(0, Math.min(i, this.frames.length - 1));
    this.emit();
  }

  private tick(): void {
    if (!this.playing) return;
    this.emit();
    if (this.index >= this.frames.length - 1) {
      this.playing = false;
      return;
    }
    this.index += 1;
    this.timer = window.setTimeout(() => this.tick(), 550);
  }

  private emit(): void {
    if (this.onUpdate) this.onUpdate(this.frames[this.index] ?? null, this.index);
  }
}
