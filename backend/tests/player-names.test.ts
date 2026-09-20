import { describe, expect, it } from 'vitest';
import { renameInGame } from '../src/modules/players/player-names.js';

/** Round 1 of a four player table: Anna gives, sits out and plays with Berta. */
const round = { players: ['Berta', 'Carl', 'Dora'], dealer: 'Anna', declarer: 'Berta' };

describe('renameInGame', () => {
  it('renames the Geber of a round', () => {
    expect(renameInGame(round, 'Anna', 'Anna M.')).toEqual({ dealer: 'Anna M.' });
  });

  it('renames the Geber even though they do not play the round', () => {
    const patch = renameInGame(round, 'Anna', 'Anna M.');

    expect(patch.players).toBeUndefined();
    expect(patch.dealer).toEqual('Anna M.');
  });

  it('renames the Alleinspieler', () => {
    expect(renameInGame(round, 'Berta', 'Berta K.')).toEqual({
      players: ['Berta K.', 'Carl', 'Dora'],
      declarer: 'Berta K.',
    });
  });

  it('renames the player in the middle of the round', () => {
    expect(renameInGame(round, 'Carl', 'Carl B.')).toEqual({
      players: ['Berta', 'Carl B.', 'Dora'],
    });
  });

  it('renames every occurrence in one game', () => {
    const solo = { players: ['Anna', 'Berta', 'Carl'], dealer: 'Anna', declarer: 'Anna' };

    expect(renameInGame(solo, 'Anna', 'Anna M.')).toEqual({
      players: ['Anna M.', 'Berta', 'Carl'],
      dealer: 'Anna M.',
      declarer: 'Anna M.',
    });
  });

  it('changes nothing in a game that does not know the name', () => {
    expect(renameInGame(round, 'Emil', 'Emilia')).toEqual({});
    expect(renameInGame({ ...round, declarer: null }, 'Emil', 'Emilia')).toEqual({});
  });

  it('keeps a similar name untouched', () => {
    const game = { players: ['Anna M.', 'Anna'], dealer: 'Anna M.', declarer: null };

    expect(renameInGame(game, 'Anna', 'Anna B.')).toEqual({
      players: ['Anna M.', 'Anna B.'],
    });
  });
});
