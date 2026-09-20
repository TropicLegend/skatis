import { nextDealer, playingPlayers, sittingOutPlayers } from './game-rules.js';

/**
 * The round a `POST …/games` would create.
 *
 * Which players may be the Alleinspieler follows from the lineup and the rounds
 * that were already played (the "Geber-Regel"), and the Geber of a round follows
 * from the seating order. A frontend must not re-derive either – it would drift
 * from what `createGame` accepts – so it asks here instead.
 *
 * `playingPlayers` is exactly the set the API accepts as `declarer` for the
 * round, and `sittingOutPlayers` is exactly the set it refuses.
 */
export interface RoundPreviewDto {
  listId: string;
  /** Round number the next game gets, counted from 1. */
  position: number;
  /** The lineup of the list in seating order. */
  lineup: string[];
  /** Geber of the round – follows the seating order. */
  dealer: string;
  /** The three players of the round: the allowed Alleinspieler. */
  playingPlayers: string[];
  /** The players who sit out this round (3 → none, 4 → the Geber, 5 → the seats around them). */
  sittingOutPlayers: string[];
}

/**
 * Builds the preview of the round that follows the rounds whose Geber are given
 * in `dealers` (one entry per round, in order). An empty `dealers` describes the
 * first round, which player 1 of the lineup deals.
 *
 * The lineup has to be complete (3, 4 or 5 players) – the caller checks that, so
 * this stays a pure function of the rules.
 */
export function buildRoundPreview(
  listId: string,
  lineup: readonly string[],
  dealers: readonly string[],
): RoundPreviewDto {
  const dealer = nextDealer(lineup, dealers.at(-1) ?? null);

  return {
    listId,
    position: dealers.length + 1,
    lineup: [...lineup],
    dealer,
    playingPlayers: playingPlayers(lineup, dealer),
    sittingOutPlayers: sittingOutPlayers(lineup, dealer),
  };
}
