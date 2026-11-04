export interface ReportData {
  score: number;
  concepts: { name: string; score: number }[];
  strengths: string[];
  review: string[];
}

export function renderReport(slot: HTMLElement, data: ReportData): void {
  const concepts = data.concepts || [];
  const strengths = data.strengths || [];
  const review = data.review || [];
  const score = Number(data.score) || 0;

  slot.innerHTML = `
    <div class="report-card">
      <div class="report-top">
        <h3>Readiness report</h3>
        <div class="score-ring" style="--p:${score}">
          <span>${score}</span>
        </div>
      </div>
      <div class="concept-bars">
        ${concepts
          .map(
            (c) => `
          <div class="concept-row">
            <div class="concept-label">${escapeHtml(c.name)}</div>
            <div class="bar"><div class="bar-fill" style="width:${clamp(c.score)}%"></div></div>
            <div class="concept-score">${c.score}</div>
          </div>`
          )
          .join("")}
      </div>
      <div class="report-cols">
        <div>
          <h4>Explained well</h4>
          <ul>${strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("") || "<li>—</li>"}</ul>
        </div>
        <div>
          <h4>Review next</h4>
          <ul class="review">${review.map((s) => `<li>${escapeHtml(s)}</li>`).join("") || "<li>—</li>"}</ul>
        </div>
      </div>
    </div>
  `;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Number(n) || 0));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
