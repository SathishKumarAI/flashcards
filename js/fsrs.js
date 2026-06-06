// FSRS-5 (Free Spaced Repetition Scheduler) — pure JS implementation.
// Reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
//
// Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy.
// A card stores: stability (S, days), difficulty (D, 1..10), due (ms), last_review (ms), reps, lapses, state.
// States: 0=New, 1=Learning, 2=Review, 3=Relearning.

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };

// FSRS-5 default parameters (19 weights).
export const DEFAULT_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81
const DAY = 86400000; // ms per day

const clampD = (d) => Math.min(Math.max(d, 1), 10);
const clampS = (s) => Math.max(s, 0.01);

export class FSRS {
  constructor(w = DEFAULT_W, requestRetention = 0.9, maximumInterval = 36500) {
    this.w = w;
    this.requestRetention = requestRetention;
    this.maximumInterval = maximumInterval;
  }

  // Retrievability: probability of recall after t days with stability S.
  retrievability(t, s) {
    return Math.pow(1 + FACTOR * t / s, DECAY);
  }

  // Days until retrievability drops to requestRetention.
  nextInterval(s) {
    const i = (s / FACTOR) * (Math.pow(this.requestRetention, 1 / DECAY) - 1);
    return Math.min(Math.max(Math.round(i), 1), this.maximumInterval);
  }

  initStability(g) {
    return clampS(this.w[g - 1]);
  }

  initDifficulty(g) {
    return clampD(this.w[4] - Math.exp(this.w[5] * (g - 1)) + 1);
  }

  nextDifficulty(d, g) {
    const deltaD = -this.w[6] * (g - 3);
    const dPrime = d + deltaD * (10 - d) / 9; // linear damping
    // mean reversion toward initial difficulty of "Easy"
    return clampD(this.w[7] * this.initDifficulty(Rating.Easy) + (1 - this.w[7]) * dPrime);
  }

  stabilityAfterRecall(d, s, r, g) {
    const hard = g === Rating.Hard ? this.w[15] : 1;
    const easy = g === Rating.Easy ? this.w[16] : 1;
    const inc =
      Math.exp(this.w[8]) *
      (11 - d) *
      Math.pow(s, -this.w[9]) *
      (Math.exp(this.w[10] * (1 - r)) - 1) *
      hard *
      easy;
    return clampS(s * (1 + inc));
  }

  stabilityAfterForget(d, s, r) {
    const sForget =
      this.w[11] *
      Math.pow(d, -this.w[12]) *
      (Math.pow(s + 1, this.w[13]) - 1) *
      Math.exp(this.w[14] * (1 - r));
    return clampS(Math.min(sForget, s)); // never larger than pre-lapse stability
  }

  // Compute the four possible outcomes for a card at time `now` (ms).
  // Returns { [rating]: { stability, difficulty, due, interval, state } }.
  preview(card, now = Date.now()) {
    const out = {};
    for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
      out[g] = this.project(card, g, now);
    }
    return out;
  }

  project(card, g, now = Date.now()) {
    let { stability: s, difficulty: d, state, last_review } = card;
    let newState;

    if (state === State.New || s == null) {
      // First exposure.
      s = this.initStability(g);
      d = this.initDifficulty(g);
      newState = g === Rating.Again ? State.Learning : State.Review;
    } else {
      const elapsedDays = last_review ? Math.max((now - last_review) / DAY, 0) : 0;
      const r = this.retrievability(elapsedDays, s);
      d = this.nextDifficulty(d, g);
      if (g === Rating.Again) {
        s = this.stabilityAfterForget(d, s, r);
        newState = State.Relearning;
      } else {
        s = this.stabilityAfterRecall(d, s, r, g);
        newState = State.Review;
      }
    }

    let interval; // days
    if (g === Rating.Again) {
      interval = 0; // relearn: show again same session / next ~10 min
    } else {
      interval = this.nextInterval(s);
    }

    const due = g === Rating.Again ? now + 10 * 60 * 1000 : now + interval * DAY;

    return {
      stability: s,
      difficulty: d,
      due,
      interval,
      state: newState,
    };
  }
}

// Human label for an interval in days (or ms-based due for sub-day).
export function fmtInterval(days, rating) {
  if (rating === Rating.Again) return "10m";
  if (days < 1) return "<1d";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
