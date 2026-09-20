import { describe, expect, it } from 'vitest';
import { buildRoundPreview } from '../src/modules/lists/round-preview.js';

const THREE = ['Anna', 'Bert', 'Clara'];
const FOUR = ['Anna', 'Bert', 'Clara', 'Dora'];
const FIVE = ['Anna', 'Bert', 'Clara', 'Dora', 'Emil'];

const LINEUPS = [THREE, FOUR, FIVE];

describe('buildRoundPreview', () => {
  it('starts with player 1 and lets everybody play in a lineup of three', () => {
    expect(buildRoundPreview('list-1', THREE, [])).toEqual({
      listId: 'list-1',
      position: 1,
      lineup: [...THREE],
      dealer: 'Anna',
      playingPlayers: [...THREE],
      sittingOutPlayers: [],
    });
  });

  it('follows the seating order when rounds were already played', () => {
    const preview = buildRoundPreview('list-1', FOUR, ['Anna']);

    expect(preview.position).toBe(2);
    expect(preview.dealer).toBe('Bert');
  });

  it('counts every round, also one that was passed out – it was dealt too', () => {
    const preview = buildRoundPreview('list-1', FOUR, ['Anna', 'Bert', 'Clara']);

    expect(preview.position).toBe(4);
    expect(preview.dealer).toBe('Dora');
  });

  it('lets the Geber sit out in a lineup of four', () => {
    const preview = buildRoundPreview('list-1', FOUR, []);

    expect(preview.sittingOutPlayers).toEqual(['Anna']);
    expect(preview.playingPlayers).toEqual(['Bert', 'Clara', 'Dora']);
  });

  it('lets the Geber play and the seats around them sit out in a lineup of five', () => {
    const preview = buildRoundPreview('list-1', FIVE, ['Anna']);

    expect(preview.dealer).toBe('Bert');
    expect(preview.sittingOutPlayers).toEqual(['Anna', 'Clara']);
    expect(preview.playingPlayers).toEqual(['Bert', 'Dora', 'Emil']);
  });

  it('wraps around at the end of the seating order', () => {
    const preview = buildRoundPreview('list-1', FIVE, ['Dora']);

    expect(preview.dealer).toBe('Emil');
    expect(preview.sittingOutPlayers).toEqual(['Dora', 'Anna']);
  });

  it('hands out a copy of the lineup', () => {
    const lineup = [...FOUR];

    expect(buildRoundPreview('list-1', lineup, []).lineup).not.toBe(lineup);
  });

  it('always names exactly the three players a game entry accepts', () => {
    for (const lineup of LINEUPS) {
      for (const previous of [null, ...lineup]) {
        const preview = buildRoundPreview('list-1', lineup, previous === null ? [] : [previous]);

        expect(preview.playingPlayers).toHaveLength(3);
        for (const name of preview.sittingOutPlayers) {
          expect(preview.playingPlayers).not.toContain(name);
        }
      }
    }
  });
});
