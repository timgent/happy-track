/**
 * Gentle nudges for the days when nothing comes to mind.
 *
 * Two rules they are written to:
 *
 * - **Small, specific, and about today.** "What are you grateful for in life?"
 *   is a question you close the app rather than answer. "Who made you smile
 *   today?" has an answer you already know.
 * - **Never about achievement.** Nothing here asks what you got done. A
 *   journal that rewards productivity becomes another place to fall short.
 */
export const PROMPTS: readonly string[] = [
    'Who made you smile today?',
    'What did you eat or drink that was good?',
    'What did you see on the way somewhere?',
    'What went better than you expected?',
    'What made you laugh?',
    'Whose message were you glad to get?',
    'What was the most comfortable moment of the day?',
    'What did you hear — music, a voice, birds?',
    'What small thing worked properly for once?',
    'What did you get to stop doing?',
    'Where did you sit down and enjoy it?',
    'What did somebody do for you?',
    'What did you do for somebody else?',
    'What was the weather doing that you liked?',
    'What did you notice that you usually walk past?',
    'What are you looking forward to tomorrow?',
    'What smelled good today?',
    'What did you finally get round to?',
    'Which bit of the day would you happily repeat?',
    'What was quiet and fine about today?',
] as const

/**
 * The prompt for a given day, plus an offset for "show me another".
 *
 * Keyed off the date rather than random, so the prompt is stable while the page
 * is open and across a reload: a suggestion that changes every render is one
 * nobody can finish reading, and one that changes on reload makes the page feel
 * like it forgot where it was.
 *
 * The hash is a small string digest of the date, so consecutive days land on
 * unrelated prompts rather than walking down the list in order.
 */
export function promptForDay(dateKey: string, offset = 0): string {
    let hash = 0
    for (let i = 0; i < dateKey.length; i++) {
        hash = (hash * 31 + dateKey.charCodeAt(i)) % 100_003
    }
    return PROMPTS[(hash + offset) % PROMPTS.length]
}
