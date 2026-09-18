import { randomInt } from 'node:crypto';

/**
 * Alphabet for public tournament IDs. Digits and upper case letters without the
 * characters that are easy to mix up when reading an ID aloud or typing it in:
 * `0`/`O` and `1`/`I`/`L` are missing.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ID_LENGTH = 8;

/** Validates a normalised (upper case) tournament id. */
export const TOURNAMENT_ID_PATTERN = new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`);

export const TOURNAMENT_ID_LENGTH = ID_LENGTH;

/** Generates a random tournament id, e.g. `K7M2P4QX`. */
export function generateTournamentId(): string {
  let id = '';

  while (id.length < ID_LENGTH) {
    const character = ALPHABET[randomInt(ALPHABET.length)];
    if (character !== undefined) {
      id += character;
    }
  }

  return id;
}

/** Normalises user input so that ids are case insensitive. */
export function normalizeTournamentId(value: string): string {
  return value.trim().toUpperCase();
}

export function isTournamentId(value: string): boolean {
  return TOURNAMENT_ID_PATTERN.test(value);
}
