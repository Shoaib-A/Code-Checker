import { ask } from "./api";
import { getCode, setLineClickHandler } from "./editor";
import { renderReport, type ReportData } from "./report";

interface HistoryItem {
  role: "examiner" | "student";
  content: string;
}

let history: HistoryItem[] = [];
let voiceOn = false;
let questionCount = 0;
const MAX_Q = 8;

export function mountDefend(root: HTMLElement): void {
  history = [];
  questionCount = 0;
  setLineClickHandler(null);

  root.innerHTML = `
    <div class="panel-header">
      <h2>Defend</h2>
      <p class="muted">An AI examiner interviews you about YOUR code.</p>
    </div>
    <div class="voice-row">
      <label class="switch">
        <input type="checkbox" id="voice-toggle" />
        <span>Voice mode</span>
      </label>
      <span class="note" id="voice-note">Works best in Chrome. Falls back to typing.</span>
    </div>
    <div id="defend-status" class="status" hidden></div>
    <div id="exam-log" class="exam-log"></div>
    <div class="exam-input-row">
      <textarea id="exam-answer" class="text-area" rows="3" placeholder="Type your answer…"></textarea>
      <div class="btn-row">
        <button class="btn primary" id="btn-start-exam">Start exam</button>
        <button class="btn" id="btn-send-answer" disabled>Send answer</button>
        <button class="btn" id="btn-mic" hidden>Hold to speak</button>
        <button class="btn" id="btn-report" disabled>Readiness report</button>
      </div>
    </div>
    <div id="report-slot"></div>
  `;

  const voiceToggle = root.querySelector("#voice-toggle") as HTMLInputElement;
  const micBtn = root.querySelector("#btn-mic") as HTMLButtonElement;
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    (root.querySelector("#voice-note") as HTMLElement).textContent =
      "Speech recognition not available — type your answers (Chrome works best).";
  }
  voiceToggle.addEventListener("change", () => {
    voiceOn = voiceToggle.checked;
    micBtn.hidden = !voiceOn || !SpeechRecognitionCtor;
  });

  root.querySelector("#btn-start-exam")!.addEventListener("click", () => void startExam(root));
  root.querySelector("#btn-send-answer")!.addEventListener("click", () => void sendAnswer(root));
  root.querySelector("#btn-report")!.addEventListener("click", () => void loadReport(root));

  if (SpeechRecognitionCtor) {
    let recognition: SpeechRecognition | null = null;
    micBtn.addEventListener("mousedown", () => {
      recognition = new SpeechRecognitionCtor();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.onresult = (ev) => {
        const text = ev.results[0][0].transcript;
        const area = root.querySelector("#exam-answer") as HTMLTextAreaElement;
        area.value = (area.value + " " + text).trim();
      };
      recognition.start();
    });
    micBtn.addEventListener("mouseup", () => recognition?.stop());
  }
}

function setStatus(root: HTMLElement, text: string | null, kind: "info" | "error" = "info"): void {
  const el = root.querySelector("#defend-status") as HTMLElement;
  if (!text) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = text;
}

function appendLog(root: HTMLElement, role: "examiner" | "student", content: string): void {
  const log = root.querySelector("#exam-log") as HTMLElement;
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.innerHTML = `<span class="bubble-role">${role === "examiner" ? "Examiner" : "You"}</span><p>${esc(content)}</p>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function speak(text: string): void {
  if (!voiceOn || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

async function startExam(root: HTMLElement): Promise<void> {
  history = [];
  questionCount = 0;
  (root.querySelector("#exam-log") as HTMLElement).innerHTML = "";
  (root.querySelector("#report-slot") as HTMLElement).innerHTML = "";
  setStatus(root, "Examiner is preparing the first question…");
  try {
    const data = await ask("examine", getCode(), { history });
    if (data.done) {
      setStatus(root, String(data.message || "Exam finished."));
      (root.querySelector("#btn-report") as HTMLButtonElement).disabled = false;
      return;
    }
    const q = String(data.question || "");
    history.push({ role: "examiner", content: q });
    questionCount += 1;
    appendLog(root, "examiner", q);
    speak(q);
    (root.querySelector("#btn-send-answer") as HTMLButtonElement).disabled = false;
    (root.querySelector("#btn-start-exam") as HTMLButtonElement).textContent = "Restart exam";
    setStatus(root, `Question ${questionCount} of ~${MAX_Q}`);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

async function sendAnswer(root: HTMLElement): Promise<void> {
  const area = root.querySelector("#exam-answer") as HTMLTextAreaElement;
  const answer = area.value.trim();
  if (!answer) return;
  area.value = "";
  history.push({ role: "student", content: answer });
  appendLog(root, "student", answer);

  if (questionCount >= MAX_Q) {
    setStatus(root, "Reached max questions. Request your readiness report.");
    (root.querySelector("#btn-report") as HTMLButtonElement).disabled = false;
    (root.querySelector("#btn-send-answer") as HTMLButtonElement).disabled = true;
    return;
  }

  setStatus(root, "Examiner is thinking…");
  try {
    const data = await ask("examine", getCode(), { history });
    if (data.done) {
      appendLog(root, "examiner", String(data.message || "Exam finished."));
      speak(String(data.message || "Exam finished."));
      (root.querySelector("#btn-report") as HTMLButtonElement).disabled = false;
      (root.querySelector("#btn-send-answer") as HTMLButtonElement).disabled = true;
      setStatus(root, null);
      return;
    }
    const q = String(data.question || "");
    history.push({ role: "examiner", content: q });
    questionCount += 1;
    appendLog(root, "examiner", q);
    speak(q);
    setStatus(root, `Question ${questionCount} of ~${MAX_Q}`);
    if (questionCount >= MAX_Q) {
      (root.querySelector("#btn-report") as HTMLButtonElement).disabled = false;
    }
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

async function loadReport(root: HTMLElement): Promise<void> {
  setStatus(root, "Writing readiness report…");
  try {
    const data = (await ask("report", getCode(), { history })) as unknown as ReportData;
    renderReport(root.querySelector("#report-slot") as HTMLElement, data);
    setStatus(root, null);
  } catch (e) {
    setStatus(root, String(e), "error");
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
