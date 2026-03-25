// tva
import { diffMain, diffCleanupSemantic, DIFF_DELETE, DIFF_INSERT } from 'diff-match-patch-es';

// SECURITY: content fields contain raw captured HTML. Render with textContent only.

const SIZE_LIMIT = 2 * 1024 * 1024; // 2 MB
const CONTEXT_LINES = 3;
const CONTEXT_GAP = 6;
const MAX_HUNKS = 200;


/**
 * Convert a flat char-level diff array into line-based hunks with context.
 *
 * @param {Array<[number, string]>} diffs
 * @returns {{ hunks: Array, stats: { additions: number, deletions: number }, truncated: boolean }}
 */
function buildHunks(diffs) {
  // Expand diffs into per-line records
  const lines = [];
  let baseLine = 1;
  let targetLine = 1;

  for (const [type, text] of diffs) {
    const parts = text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      // Every split except the last represents a complete line; the last
      // may be a partial line that will be continued by the next diff chunk.
      // We emit a record for each newline-terminated segment.
      const isLast = i === parts.length - 1;
      const content = isLast ? parts[i] : parts[i] + '\n';
      if (!isLast || content !== '') {
        if (type === DIFF_DELETE) {
          lines.push({ type: 'deletion', content, baseLine: baseLine++, targetLine: null });
        } else if (type === DIFF_INSERT) {
          lines.push({ type: 'addition', content, baseLine: null, targetLine: targetLine++ });
        } else {
          lines.push({ type: 'context', content, baseLine: baseLine++, targetLine: targetLine++ });
        }
      }
    }
  }

  // Identify indices of changed lines
  const changedIndices = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'context') changedIndices.add(i);
  }

  if (changedIndices.size === 0) {
    return { hunks: [], stats: { additions: 0, deletions: 0 }, truncated: false };
  }

  // Build inclusion windows: changed index ± CONTEXT_LINES
  const included = new Set();
  for (const idx of changedIndices) {
    for (let d = -CONTEXT_LINES; d <= CONTEXT_LINES; d++) {
      const j = idx + d;
      if (j >= 0 && j < lines.length) included.add(j);
    }
  }

  // Group included indices into hunks; a gap > CONTEXT_GAP starts a new hunk
  const sorted = [...included].sort((a, b) => a - b);
  const groups = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > CONTEXT_GAP) {
      groups.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  groups.push(current);

  // Count changed lines
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.type === 'addition') additions++;
    else if (line.type === 'deletion') deletions++;
  }

  let truncated = false;
  let hunkList = groups;
  if (hunkList.length > MAX_HUNKS) {
    hunkList = hunkList.slice(0, MAX_HUNKS);
    truncated = true;
  }

  const hunks = hunkList.map((group) => {
    const first = lines[group[0]];
    return {
      baseLine: first.baseLine ?? first.targetLine,
      targetLine: first.targetLine ?? first.baseLine,
      lines: group.map((idx) => ({
        type: lines[idx].type,
        content: lines[idx].content,
      })),
    };
  });

  return { hunks, stats: { additions, deletions }, truncated };
}

/**
 * Diff two HTML strings at character level using diff-match-patch.
 *
 * @param {string} baseHtml
 * @param {string} targetHtml
 * @returns {{ changed: boolean, truncated: boolean, stats: { additions: number, deletions: number }, hunks: Array }}
 */
export function diffHtml(baseHtml, targetHtml) {
  if (baseHtml === targetHtml) {
    return { changed: false, truncated: false, stats: { additions: 0, deletions: 0 }, hunks: [] };
  }

  if (baseHtml.length > SIZE_LIMIT || targetHtml.length > SIZE_LIMIT) {
    return {
      changed: true,
      truncated: true,
      stats: { additions: 0, deletions: 0 },
      hunks: [],
    };
  }

  const diffs = diffMain(baseHtml, targetHtml, { diffTimeout: 5 });
  diffCleanupSemantic(diffs);

  const { hunks, stats, truncated } = buildHunks(diffs);

  return {
    changed: stats.additions > 0 || stats.deletions > 0,
    truncated,
    stats,
    hunks,
  };
}

/**
 * Diff two header snapshots.
 *
 * @param {{ status?: number, statusText?: string, headers?: Record<string, string> }} baseHeaders
 * @param {{ status?: number, statusText?: string, headers?: Record<string, string> }} targetHeaders
 * @returns {{ changed: boolean, added: Array, removed: Array, modified: Array, unchanged: number, statusChanged: boolean }}
 */
export function diffHeaders(baseHeaders, targetHeaders) {
  const empty = { changed: false, added: [], removed: [], modified: [], unchanged: 0, statusChanged: false };

  if (
    !baseHeaders || typeof baseHeaders !== 'object' || !baseHeaders.headers ||
    !targetHeaders || typeof targetHeaders !== 'object' || !targetHeaders.headers
  ) {
    return empty;
  }

  const baseH = baseHeaders.headers;
  const targetH = targetHeaders.headers;

  const statusChanged = baseHeaders.status !== targetHeaders.status;

  const added = [];
  const removed = [];
  const modified = [];
  let unchanged = 0;

  const allKeys = new Set([...Object.keys(baseH), ...Object.keys(targetH)]);

  for (const name of allKeys) {
    const inBase = Object.prototype.hasOwnProperty.call(baseH, name);
    const inTarget = Object.prototype.hasOwnProperty.call(targetH, name);

    if (inBase && !inTarget) {
      removed.push({ name, baseValue: baseH[name] });
    } else if (!inBase && inTarget) {
      added.push({ name, targetValue: targetH[name] });
    } else if (baseH[name] !== targetH[name]) {
      modified.push({ name, baseValue: baseH[name], targetValue: targetH[name] });
    } else {
      unchanged++;
    }
  }

  const changed = statusChanged || added.length > 0 || removed.length > 0 || modified.length > 0;

  return { changed, added, removed, modified, unchanged, statusChanged };
}

/**
 * Compare two artifact hashes (SHA-256 hex or R2 ETag).
 *
 * @param {string|null|undefined} baseHash
 * @param {string|null|undefined} targetHash
 * @returns {{ changed: boolean, method: 'hash' }}
 */
export function diffScreenshot(baseHash, targetHash) {
  const baseMissing = baseHash == null;
  const targetMissing = targetHash == null;

  if (baseMissing && targetMissing) {
    return { changed: false, method: 'hash' };
  }
  if (baseMissing || targetMissing) {
    return { changed: true, method: 'hash' };
  }
  return { changed: baseHash !== targetHash, method: 'hash' };
}

/**
 * Aggregate individual diff results into a lightweight change summary.
 *
 * @param {{ changed: boolean, stats?: { additions: number, deletions: number } }} htmlDiff
 * @param {{ changed: boolean, added?: Array, removed?: Array, modified?: Array }} headerDiff
 * @param {{ changed: boolean }} screenshotDiff
 * @returns {{ changed: boolean, html: object, screenshot: object, headers: object }}
 */
export function computeChangeSummary(htmlDiff, headerDiff, screenshotDiff) {
  const htmlChanged = !!htmlDiff?.changed;
  const headerChanged = !!headerDiff?.changed;
  const screenshotChanged = !!screenshotDiff?.changed;

  const headerChanges =
    (headerDiff?.added?.length ?? 0) +
    (headerDiff?.removed?.length ?? 0) +
    (headerDiff?.modified?.length ?? 0) +
    (headerDiff?.statusChanged ? 1 : 0);

  return {
    changed: htmlChanged || headerChanged || screenshotChanged,
    html: {
      changed: htmlChanged,
      additions: htmlDiff?.stats?.additions ?? 0,
      deletions: htmlDiff?.stats?.deletions ?? 0,
    },
    screenshot: {
      changed: screenshotChanged,
    },
    headers: {
      changed: headerChanged,
      changes: headerChanges,
    },
  };
}
