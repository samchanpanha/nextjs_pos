import type { MenuItem } from '../types/pos';

export interface VoiceMatchedOrderItem {
  item: MenuItem;
  qty: number;
  optionLabel?: string;
  deltaUsd: number;
  note?: string;
  confidence: number;
  rawSegment: string;
}

export interface VoiceOrderParseResult {
  matched: VoiceMatchedOrderItem[];
  unmatched: string[];
  normalizedTranscript: string;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  couple: 2,
  pair: 2,
  double: 2,
  three: 3,
  triple: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const MODIFIER_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /\b(?:no|without)\s+ice\b/gi, label: 'No ice' },
  { regex: /\b(?:less|light|little)\s+ice\b/gi, label: 'Less ice' },
  { regex: /\bextra\s+ice\b/gi, label: 'Extra ice' },
  { regex: /\b(?:no|zero|without)\s+sugar\b/gi, label: 'No sugar' },
  { regex: /\b(?:less|low|half)\s+(?:sugar|sweet)\b/gi, label: 'Less sugar' },
  { regex: /\b(?:no|without)\s+(?:spice|spicy|chili)\b/gi, label: 'Not spicy' },
  { regex: /\b(?:less|mild)\s+spicy\b/gi, label: 'Less spicy' },
  { regex: /\b(?:extra|more|very)\s+spicy\b/gi, label: 'Extra spicy' },
  { regex: /\b(?:no|without)\s+onions?\b/gi, label: 'No onion' },
  { regex: /\bserve\s+first\b/gi, label: 'Serve first' },
  { regex: /\b(?:make\s+it\s+|serve\s+)?hot\b/gi, label: 'Hot' },
];

const PHONETIC_ALIASES: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\b(?:lock\s*lack|luck\s*lack|loc\s*lac)\b/gi, replacement: 'lok lak' },
  { pattern: /\b(?:kuy\s*tiew|katiew|kuytiew|hu\s*tieu)\b/gi, replacement: 'kuy teav' },
  { pattern: /\b(?:armok|ah\s*mok)\b/gi, replacement: 'amok' },
  { pattern: /\b(?:bon\s*mi|ban\s*mi|bahn\s*mi)\b/gi, replacement: 'banh mi' },
  { pattern: /\b(?:com\s*tam)\b/gi, replacement: 'broken rice' },
  { pattern: /\b(?:ca\s*phe|cafe)\s+sua\s+da\b/gi, replacement: 'iced coffee condensed milk' },
  { pattern: /\bice\s+coffee\b/gi, replacement: 'iced coffee' },
  { pattern: /\bices?\s+latte\b/gi, replacement: 'matcha latte' },
];

const STOP_WORDS = new Set([
  'please',
  'add',
  'order',
  'want',
  'need',
  'get',
  'give',
  'me',
  'us',
  'can',
  'could',
  'would',
  'like',
  'to',
  'the',
  'of',
  'for',
  'with',
  'and',
  'cup',
  'cups',
  'glass',
  'glasses',
  'bowl',
  'bowls',
  'plate',
  'plates',
  'order',
  'orders',
  'item',
  'items',
]);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  const norm = normalizeText(value);
  if (!norm) return [];
  return norm.split(' ').filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[b.length];
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 3 && b.startsWith(a)) return 0.9;
  if (b.length >= 3 && a.startsWith(b)) return 0.9;
  if (Math.min(a.length, b.length) <= 2) return 0;
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  const ratio = 1 - dist / maxLen;
  return ratio >= 0.68 ? ratio : 0;
}

function stripLeadingCommands(text: string): string {
  return text
    .replace(
      /^(?:please\s+|can\s+(?:i|we)\s+(?:get|have|order)\s+|i(?:'d|\s+would)\s+like\s+(?:to\s+order\s+)?|add\s+|order\s+)/i,
      ''
    )
    .trim();
}

function extractQuantityAndClean(clause: string): { qty: number; rest: string } {
  let working = stripLeadingCommands(clause);

  // Leading "2x ..." or "x2 ..." or "2 ..."
  const digitStart = working.match(/^(?:(\d{1,2})\s*x?\s+|x\s*(\d{1,2})\s+)/i);
  if (digitStart) {
    const parsed = Number(digitStart[1] || digitStart[2]);
    if (parsed >= 1 && parsed <= 50) {
      working = working.slice(digitStart[0].length).trim();
      return { qty: parsed, rest: stripLeadingCommands(working) };
    }
  }

  // Trailing "x2" or "x 2"
  const digitEnd = working.match(/\s+x\s*(\d{1,2})$/i);
  if (digitEnd) {
    const parsed = Number(digitEnd[1]);
    if (parsed >= 1 && parsed <= 50) {
      working = working.slice(0, working.length - digitEnd[0].length).trim();
      return { qty: parsed, rest: working };
    }
  }

  // Leading English number word ("two iced coffee", "a beef lok lak")
  const firstWordMatch = working.match(/^([a-zA-Z]+)\b\s*/);
  if (firstWordMatch) {
    const word = firstWordMatch[1].toLowerCase();
    const num = NUMBER_WORDS[word];
    if (num) {
      working = working.slice(firstWordMatch[0].length).trim();
      return { qty: num, rest: stripLeadingCommands(working) };
    }
  }

  return { qty: 1, rest: working };
}

function extractModifiers(clause: string): { note?: string; cleaned: string } {
  let working = clause;
  const notes: string[] = [];
  for (const mod of MODIFIER_PATTERNS) {
    if (mod.regex.test(working)) {
      notes.push(mod.label);
      working = working.replace(mod.regex, ' ');
    }
    mod.regex.lastIndex = 0;
  }
  return {
    note: notes.length > 0 ? Array.from(new Set(notes)).join(', ') : undefined,
    cleaned: working.replace(/\s+/g, ' ').trim(),
  };
}

function applyAliases(text: string): string {
  let out = text;
  for (const alias of PHONETIC_ALIASES) {
    out = out.replace(alias.pattern, alias.replacement);
  }
  return out;
}

function resolveOptionChoice(
  item: MenuItem,
  clauseText: string
): { optionLabel?: string; deltaUsd: number; strippedText: string } {
  if (!item.options || item.options.length === 0) {
    return { optionLabel: undefined, deltaUsd: 0, strippedText: clauseText };
  }

  const allChoices = item.options.flatMap((g) => g.choices || []);
  if (allChoices.length === 0) {
    return { optionLabel: undefined, deltaUsd: 0, strippedText: clauseText };
  }

  const normClause = normalizeText(clauseText);

  // Check explicit keywords for sizes/options
  for (const choice of allChoices) {
    const normChoice = normalizeText(choice.label);
    const choiceTokens = normChoice.split(' ').filter((t) => t.length > 0);
    if (normClause.includes(normChoice)) {
      return {
        optionLabel: choice.label,
        deltaUsd: choice.deltaUsd,
        strippedText: clauseText,
      };
    }
    if (
      choiceTokens.some((tok) => ['large', 'special', 'small', 'regular', 'medium'].includes(tok)) &&
      choiceTokens.some((tok) => new RegExp(`\\b${tok}\\b`, 'i').test(normClause))
    ) {
      return {
        optionLabel: choice.label,
        deltaUsd: choice.deltaUsd,
        strippedText: clauseText,
      };
    }
    if (/\bsize\s*l\b|\blarge\b/i.test(normClause) && /\b(l|large)\b/i.test(normChoice)) {
      return {
        optionLabel: choice.label,
        deltaUsd: choice.deltaUsd,
        strippedText: clauseText,
      };
    }
    if (/\bsize\s*m\b|\bmedium\b|\bregular\b/i.test(normClause) && /\b(m|medium|regular)\b/i.test(normChoice)) {
      return {
        optionLabel: choice.label,
        deltaUsd: choice.deltaUsd,
        strippedText: clauseText,
      };
    }
  }

  const defaultChoice = allChoices.find((c) => c.deltaUsd === 0) || allChoices[0];
  return {
    optionLabel: defaultChoice.label,
    deltaUsd: defaultChoice.deltaUsd,
    strippedText: clauseText,
  };
}

function scoreMenuItemMatch(queryText: string, item: MenuItem): number {
  const aliasedQuery = applyAliases(queryText);
  const normQuery = normalizeText(aliasedQuery);
  if (!normQuery) return 0;

  const queryTokens = tokenize(aliasedQuery);
  const targets = [
    normalizeText(item.nameEn),
    normalizeText(item.nameKh),
    normalizeText(item.nameVi),
    item.initials.toLowerCase(),
  ].filter(Boolean);

  // Exact match
  if (targets.some((t) => t === normQuery)) {
    return 1.0;
  }

  // Exact substring match inside primary names
  const nameEnNorm = normalizeText(item.nameEn);
  const nameViNorm = normalizeText(item.nameVi);
  const nameKhNorm = normalizeText(item.nameKh);
  if (
    (normQuery.length >= 4 && (nameEnNorm.includes(normQuery) || nameViNorm.includes(normQuery) || nameKhNorm.includes(normQuery))) ||
    (nameEnNorm.length >= 4 && normQuery.includes(nameEnNorm))
  ) {
    const coverage = Math.min(normQuery.length, nameEnNorm.length) / Math.max(normQuery.length, nameEnNorm.length);
    return Math.min(0.98, 0.78 + coverage * 0.2);
  }

  if (queryTokens.length === 0) return 0;

  const candidateNames = [item.nameEn, item.nameVi, item.nameKh].filter(Boolean);
  let best = 0;

  for (const cand of candidateNames) {
    const candTokens = tokenize(cand);
    if (candTokens.length === 0) continue;

    let queryMatchedWeight = 0;
    for (const qTok of queryTokens) {
      let bestTokScore = 0;
      for (const cTok of candTokens) {
        const sim = tokenSimilarity(qTok, cTok);
        if (sim > bestTokScore) bestTokScore = sim;
      }
      queryMatchedWeight += bestTokScore;
    }

    const queryRecall = queryMatchedWeight / queryTokens.length;
    const candCoverage = queryMatchedWeight / Math.max(queryTokens.length, candTokens.length);
    const combined = queryRecall * 0.72 + candCoverage * 0.28;
    if (combined > best) best = combined;
  }

  return best;
}

export function splitVoiceTranscriptClauses(transcript: string): string[] {
  if (!transcript.trim()) return [];
  return transcript
    .replace(/\r?\n/g, ',')
    .split(/(?:\s*[,;+&]\s*|\s+(?:and|plus|also|then)\s+)/i)
    .map((part) => part.replace(/^(?:and|plus|also|then)\s+/i, '').trim())
    .filter((part) => part.length > 0);
}

export function parseVoiceOrderTranscript(
  transcript: string,
  menuItems: MenuItem[]
): VoiceOrderParseResult {
  const activeMenu = menuItems.filter((m) => m.active);
  const clauses = splitVoiceTranscriptClauses(transcript);
  const matched: VoiceMatchedOrderItem[] = [];
  const unmatched: string[] = [];

  for (const rawClause of clauses) {
    const { note, cleaned } = extractModifiers(rawClause);
    const { qty, rest } = extractQuantityAndClean(cleaned || rawClause);

    // Remove pure option words from matching text while preserving full clause for option choice
    const matchText = rest
      .replace(/\b(?:size\s*[sml]|large|medium|regular|small|special)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!matchText && !rest) {
      continue;
    }

    let bestItem: MenuItem | null = null;
    let bestScore = 0;

    for (const item of activeMenu) {
      const score = scoreMenuItemMatch(matchText || rest, item);
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    if (bestItem && bestScore >= 0.45) {
      const optionResolved = resolveOptionChoice(bestItem, rawClause);
      matched.push({
        item: bestItem,
        qty,
        optionLabel: optionResolved.optionLabel,
        deltaUsd: optionResolved.deltaUsd,
        note,
        confidence: Math.round(bestScore * 100) / 100,
        rawSegment: rawClause,
      });
    } else {
      unmatched.push(rawClause);
    }
  }

  return {
    matched,
    unmatched,
    normalizedTranscript: transcript.trim(),
  };
}
