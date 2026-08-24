import type { GitState } from '../types.js';
import { blobHash } from '../resolver/git.js';

export function classify(args: {
  finalContent: Buffer | null;     // 가장 최근 세션의 최종본
  currentContent: Buffer | null;   // 지금 디스크에 있는 것
  gitBlobs: Set<string> | null;    // null = git 판정 불가
  ignored?: boolean;               // git 이 무시하는 경로 = git 기준선 없음
}): GitState {
  const { finalContent, currentContent, gitBlobs, ignored } = args;

  // 기준선을 모르면 아무 판정도 하지 않는다.
  if (finalContent === null) return 'unknown';
  if (gitBlobs === null) return 'unknown';
  if (ignored) return 'unknown';

  const inGit = gitBlobs.has(blobHash(finalContent));
  const sameAsDisk = currentContent !== null && finalContent.equals(currentContent);

  if (sameAsDisk) return inGit ? 'committed' : 'uncommitted';
  return inGit ? 'superseded' : 'lost';
}
