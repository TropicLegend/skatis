import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/lib/http-error.js';
import { assertLastGame } from '../src/modules/lists/game.service.js';

describe('assertLastGame', () => {
  const games = [
    { id: 'game-1', position: 1 },
    { id: 'game-2', position: 2 },
  ];

  it('allows deleting the game with the highest position', () => {
    expect(assertLastGame('list-1', 'game-2', games)).toEqual(games[1]);
  });

  it('rejects deleting a game while a later one exists', () => {
    try {
      assertLastGame('list-1', 'game-1', games);
      throw new Error('Expected deletion guard to reject the earlier game');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(409);
    }
  });

  it('returns not found for a game outside the list', () => {
    expect(() => assertLastGame('list-1', 'missing', games)).toThrow(HttpError);
  });
});