import { conflict } from '../../lib/http-error.js';
import type { GameInput } from './game.schemas.js';
import { MAX_LINEUP, MIN_LINEUP, playingPlayers, sittingOutPlayers } from './game-rules.js';

/**
 * Steps of the game entry flow that need the data of a list. Kept apart from
 * `game-rules.ts` so that both the list and the game service can use them.
 */

/** A list has to be complete before games can be entered for it. */
export function assertLineupComplete(playerCount: number): void {
  if (playerCount === 0) {
    throw conflict('The list has no players yet – add the players of this table first');
  }
  if (playerCount < MIN_LINEUP || playerCount > MAX_LINEUP) {
    throw conflict(`A list consists of ${MIN_LINEUP}, ${MIN_LINEUP + 1} or ${MAX_LINEUP} players`, {
      players: playerCount,
    });
  }
}

/**
 * Step 1 of the entry flow: the Alleinspieler has to be part of the lineup and
 * has to be one of the three players of this round – the Geber sits out with 4
 * players, their neighbours sit out with 5 players.
 */
export function assertDeclarerAllowed(
  input: GameInput,
  lineup: readonly string[],
  dealer: string,
): void {
  if (input.passedOut) return;

  if (!lineup.includes(input.declarer)) {
    throw conflict(`The declarer has to be one of the players of the list (${lineup.join(', ')})`, {
      declarer: input.declarer,
      players: [...lineup],
    });
  }

  const sittingOut = sittingOutPlayers(lineup, dealer);
  if (sittingOut.includes(input.declarer)) {
    throw conflict(`${input.declarer} sits out this round because ${dealer} deals`, {
      dealer,
      sittingOutPlayers: sittingOut,
      playingPlayers: playingPlayers(lineup, dealer),
    });
  }
}
