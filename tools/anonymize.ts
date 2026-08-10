export interface NameMap { user: string; replacement: string }

export function newNameMap(opts: { user: string; replacement?: string }): NameMap {
  return { user: opts.user, replacement: opts.replacement ?? 'testuser' };
}

const TEXT_FIELDS = new Set(['content', 'text', 'lastPrompt', 'display', 'aiTitle', 'stdout']);

function scrub(value: unknown, map: NameMap, key?: string): unknown {
  if (typeof value === 'string') {
    let s = value.split(map.user).join(map.replacement);
    if (key && TEXT_FIELDS.has(key) && s.length > 0) {
      s = key === 'aiTitle' ? '테스트 세션' : '[redacted prompt]';
    }
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, map));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrub(v, map, k);
    }
    return out;
  }
  return value;
}

export function anonymizeLine(line: string, map: NameMap): string {
  const trimmed = line.trim();
  if (!trimmed) return line;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return line;          // 깨진 줄은 픽스처의 자산이므로 보존
  }
  return JSON.stringify(scrub(parsed, map));
}
