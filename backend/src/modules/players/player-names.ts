/**
 * The names a game carries for its lineup. They are copies: the lineup itself
 * is a relation and follows a rename on its own, the names inside the games do
 * not.
 */
export interface GameNames {
  players: readonly string[];
  dealer: string;
  declarer: string | null;
}

/**
 * The names of one game with `from` replaced by `to`. Only the properties that
 * really carry the old name are returned, so an update never rewrites a column
 * that has nothing to do with the rename.
 *
 * The Geber of a round is the player who sits out – with four players they are
 * not part of `players` –, so `dealer` has to be looked at on its own.
 */
export function renameInGame(
  game: GameNames,
  from: string,
  to: string,
): { players?: string[]; dealer?: string; declarer?: string } {
  return {
    ...(game.players.includes(from)
      ? { players: game.players.map((name) => (name === from ? to : name)) }
      : {}),
    ...(game.dealer === from ? { dealer: to } : {}),
    ...(game.declarer === from ? { declarer: to } : {}),
  };
}
