/**
 * The short note from the founders on the dashboard overview. One a day, the
 * same for every tutor, picked by the UK calendar date so it turns over at
 * midnight in London rather than whenever the server's clock does.
 */
export const DAILY_NOTES = [
  "Don't forget to smile today. You're a special person.",
  'Somewhere, a student is braver because of you.',
  'The patience you bring to a lesson is a gift. Keep giving it.',
  'Small wins count. Celebrate the ones your students had this week.',
  "Every mistake a student makes in your lesson is one they won't be afraid of later.",
  "You don't just teach a language. You give people a new way to be heard.",
  "Take a proper break between lessons today. You teach better when you're rested.",
  'Your students remember how you made them feel long after the grammar.',
  "Some days are slow. Progress still counts when it's quiet.",
  'Thank you for showing up for your students. It matters more than you know.',
  'A good question from you can do more than a long explanation.',
  'Be as kind to yourself today as you are to your students.',
  'One lesson at a time is how every fluent speaker got there.',
  "Laughing in a lesson isn't time wasted. It's how people relax enough to speak.",
  "You're building someone's confidence, one conversation at a time.",
  "It's okay not to have a perfect lesson. Real ones are better.",
  'Drink some water, stretch your shoulders, and go be brilliant.',
  'Your enthusiasm is contagious. Let it spread today.',
  'Remember why you started teaching. That reason is still true.',
  'The student who struggles most today may thank you most one day.',
  "Listening well is half of teaching well. You're good at both.",
  'Notice one thing a student does better than last month, and tell them.',
  "You're allowed to be proud of the teacher you've become.",
  'A calm teacher makes a brave student. Breathe, and begin.',
  "Your lessons open doors you'll never see: jobs, friendships, new homes.",
  "Progress isn't always loud. Trust the work you and your students are putting in.",
  "Teaching is hard work. Look how well you're doing it.",
  "Make today's lesson one you'd enjoy taking yourself.",
  'Every student you teach carries a little of you into the world.',
  'Let the notes take care of the admin. You take care of the people.',
  "We're so glad you're here. Have a wonderful day of teaching.",
] as const

/** Days since the epoch for today's date in London, so the note is stable all day. */
function londonDayNumber(now: Date): number {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) // YYYY-MM-DD
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000)
}

export function dailyNote(now = new Date()): string {
  return DAILY_NOTES[londonDayNumber(now) % DAILY_NOTES.length]
}
