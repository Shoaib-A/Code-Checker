import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import "highlight.js/styles/github-dark.css";

hljs.registerLanguage("python", python);

export type LineClickHandler = (lineNumber: number) => void;

let onLineClick: LineClickHandler | null = null;
let highlightedLine = 0;

export function initEditor(): void {
  const textarea = document.getElementById("code-input") as HTMLTextAreaElement;
  const viewer = document.getElementById("code-viewer") as HTMLElement;
  const gutter = document.getElementById("code-gutter") as HTMLElement;

  textarea.addEventListener("input", () => renderViewer(textarea.value));
  textarea.addEventListener("scroll", () => {
    viewer.scrollTop = textarea.scrollTop;
    viewer.scrollLeft = textarea.scrollLeft;
    gutter.scrollTop = textarea.scrollTop;
  });

  gutter.addEventListener("click", (ev) => {
    const row = (ev.target as HTMLElement).closest("[data-line]") as HTMLElement | null;
    if (!row) return;
    const n = Number(row.dataset.line);
    highlightLine(n);
    if (onLineClick) onLineClick(n);
  });

  renderViewer(textarea.value);
}

export function getCode(): string {
  return (document.getElementById("code-input") as HTMLTextAreaElement).value;
}

export function setCode(code: string): void {
  const textarea = document.getElementById("code-input") as HTMLTextAreaElement;
  textarea.value = code;
  renderViewer(code);
}

export function setLineClickHandler(handler: LineClickHandler | null): void {
  onLineClick = handler;
  (document.getElementById("code-gutter") as HTMLElement).classList.toggle(
    "is-hot",
    handler !== null
  );
}

export function highlightLine(lineNumber: number): void {
  highlightedLine = lineNumber;
  document.querySelectorAll(".code-line, .gutter-line").forEach((row) => {
    const n = Number((row as HTMLElement).dataset.line);
    row.classList.toggle("is-active", n === lineNumber);
  });
}

function renderViewer(code: string): void {
  const viewer = document.getElementById("code-viewer") as HTMLElement;
  const gutter = document.getElementById("code-gutter") as HTMLElement;
  const lines = code.split("\n");

  if (lines.length === 1 && lines[0] === "") {
    viewer.innerHTML = `<div class="code-empty">Paste your code or click Load sample</div>`;
    gutter.innerHTML = "";
    return;
  }

  gutter.innerHTML = lines
    .map((_, i) => {
      const n = i + 1;
      const active = n === highlightedLine ? " is-active" : "";
      return `<div class="gutter-line${active}" data-line="${n}">${n}</div>`;
    })
    .join("");

  viewer.innerHTML = lines
    .map((line, i) => {
      const n = i + 1;
      const highlighted = hljs.highlight(line || " ", {
        language: "python",
        ignoreIllegals: true,
      }).value;
      const active = n === highlightedLine ? " is-active" : "";
      return `<div class="code-line${active}" data-line="${n}"><span class="line-code">${highlighted}</span></div>`;
    })
    .join("");
}

export async function fetchGithubFile(url: string): Promise<string> {
  let raw = url.trim();
  const blobMatch = raw.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/
  );
  if (blobMatch) {
    const [, user, repo, branch, path] = blobMatch;
    raw = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
  }
  const res = await fetch(raw);
  if (!res.ok) throw new Error("Could not fetch that GitHub file. Check the URL.");
  return res.text();
}
