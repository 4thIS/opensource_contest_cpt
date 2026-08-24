import type { AuditReport } from '../types.js';

const MASK = '▓▓▓';

const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
];

/** 파일 전체를 가려야 하는 경로 패턴. */
const SENSITIVE_FILES = /(^|\/)\.env(\.|$)|(^|\/)(id_rsa|id_ed25519)$/i;

export function redactText(text: string): { text: string; count: number } {
  let out = text;
  let count = 0;
  for (const re of PATTERNS) {
    out = out.replace(re, () => { count++; return MASK; });
  }
  return { text: out, count };
}

export function redactReport(report: AuditReport): AuditReport {
  let total = 0;

  const scrub = (s: string): string => {
    const r = redactText(s);
    total += r.count;
    return r.text;
  };

  for (const s of report.sessions) {
    s.firstPrompt = scrub(s.firstPrompt);
    if (s.title) s.title = scrub(s.title);
    if (s.messages) {
      for (const m of s.messages) {
        m.text = scrub(m.text);
        for (const t of m.toolCalls) t.summary = scrub(t.summary);
      }
    }
  }

  for (const f of report.files) {
    if (!f.diff) continue;
    const whole = SENSITIVE_FILES.test(f.relPath ?? f.absPath);
    for (const h of f.diff) {
      h.lines = h.lines.map((line) => {
        const prefix = line.slice(0, 1);
        const body = line.slice(1);
        if (whole && body.trim().length > 0) {
          total++;
          return `${prefix}${MASK}`;
        }
        const r = redactText(body);
        total += r.count;
        return `${prefix}${r.text}`;
      });
    }
  }

  for (const w of report.warnings) w.message = scrub(w.message);

  report.stats.redacted = total;
  return report;
}
