/**
 * `/poll` parsing.
 *
 * Pure, like `dice.ts`, so a test never needs a database or a server. The
 * server calls this from the message route and stores what comes back; the
 * client never parses a poll itself.
 */

export const POLL_LIMITS = {
  minOptions: 2,
  maxOptions: 10,
  question: { min: 1, max: 200 },
  option: { min: 1, max: 80 },
} as const;

export interface ParsedPoll {
  question: string;
  options: string[];
  /** `/poll*` allows more than one pick. */
  multiple: boolean;
}

export type ParsePollResult = { ok: true; poll: ParsedPoll } | { ok: false; error: string };

const PARSE_ERROR = 'A poll needs a question and at least two choices, separated by |.';

/** `/poll ...` or `/poll* ...`. Anchored, so it never fires on a word that merely starts with "poll". */
const POLL_COMMAND_RE = /^\/poll(\*)?\s+([\s\S]+)$/i;

/**
 * Recognises a `/poll` line and parses it in one pass. Returns null when the
 * text is not a poll command at all, so the caller can tell "not a poll" from
 * "a poll that does not check out."
 */
export function parsePollCommand(content: string): ParsePollResult | null {
  const match = POLL_COMMAND_RE.exec(content.trim());
  if (!match) return null;

  const multiple = match[1] === '*';
  const [question = '', ...options] = (match[2] ?? '').split('|').map((part) => part.trim());

  const questionOk = question.length >= POLL_LIMITS.question.min && question.length <= POLL_LIMITS.question.max;
  const optionsOk =
    options.length >= POLL_LIMITS.minOptions &&
    options.length <= POLL_LIMITS.maxOptions &&
    options.every((option) => option.length >= POLL_LIMITS.option.min && option.length <= POLL_LIMITS.option.max);

  if (!questionOk || !optionsOk) return { ok: false, error: PARSE_ERROR };

  return { ok: true, poll: { question, options, multiple } };
}
