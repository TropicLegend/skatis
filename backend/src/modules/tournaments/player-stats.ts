import type { GameType } from '@prisma/client';
import { BASE_VALUES } from '../lists/game-rules.js';

/**
 * The game statistics of one player – how he took part in the rounds of the
 * counted lists and how he did there.
 *
 * Everything is derived from the games themselves, so the page cannot show
 * numbers the standing does not have. A game the player was at the table in is
 * exactly one of three things: his own Alleinspiel, a Gegenspiel (somebody else
 * played) or a round that was passed out – the three roles add up to
 * `gamesPlayed` of his ranking row.
 *
 * "Gewonnen" as a Gegenspieler means the Alleinspieler lost: that is the game the
 * opponent bonus is paid for. It is counted here for the rounds the player was at
 * the table in, while the ranking counts every lost Alleinspiel of the others –
 * the bonus is paid to the whole lineup, also to a player who sat out.
 */

/** The Spielarten in the order of the enum – the rules module decides it. */
const GAME_TYPE_ORDER: GameType[] = [
  ...(Object.keys(BASE_VALUES) as Array<Exclude<GameType, 'NULL'>>),
  'NULL',
];

/** The properties of a game the statistics need. */
export interface StatGame {
  /** The three players of the round. */
  players: readonly string[];
  /** `null` when the game was passed out. */
  declarer: string | null;
  /** `null` when the game was passed out. */
  won: boolean | null;
  gameType: GameType | null;
  /** Gewinnstufe "Hand" – also set for "Null Hand". */
  hand: boolean;
}

export interface PlayerRoleStatsDto {
  /** Games the player took part in – the `gamesPlayed` of the ranking row. */
  played: number;
  /** Of those: the rounds he was the Alleinspieler in. */
  declarer: number;
  /** Of those: the rounds somebody else played. */
  defender: number;
  /** Of those: the rounds that were passed out ("Eingepasst"). */
  passedOut: number;
  /** `declarer / played` in percent; `null` without a game. */
  declarerShare: number | null;
  /** `defender / played` in percent; `null` without a game. */
  defenderShare: number | null;
  /** `passedOut / played` in percent; `null` without a game. */
  passedOutShare: number | null;
}

export interface PlayerDeclarerStatsDto {
  /** His Alleinspiele. */
  played: number;
  won: number;
  lost: number;
  /** `won / played` in percent – the Erfolgsquote of his Alleinspiele. */
  winShare: number | null;
}

export interface PlayerHandStatsDto {
  /** His Alleinspiele with the Gewinnstufe "Hand". */
  played: number;
  won: number;
  /** `played` in percent of all his Alleinspiele. */
  share: number | null;
  /** `won / played` in percent – how he did with his Hand games. */
  winShare: number | null;
}

export interface PlayerDefenderStatsDto {
  /** His Gegenspiele: rounds somebody else played. */
  played: number;
  /** Of those: the rounds the Alleinspieler lost. */
  won: number;
  /** `won / played` in percent. */
  winShare: number | null;
}

export interface PlayerGameTypeStatsDto {
  gameType: GameType;
  /** His Alleinspiele of that Spielart. */
  played: number;
  won: number;
  /** `played` in percent of all his Alleinspiele. */
  share: number | null;
  /** `won / played` in percent. */
  winShare: number | null;
}

/** The three groups a Spielart belongs to – the slices of the pie. */
export type GameTypeGroup = 'SUIT' | 'GRAND' | 'NULL';

export interface PlayerGameTypeGroupStatsDto {
  group: GameTypeGroup;
  /** His Alleinspiele of that group: Farbspiel, Grand or Null. */
  played: number;
  won: number;
  /** `played` in percent of all his Alleinspiele. */
  share: number | null;
  /** `won / played` in percent. */
  winShare: number | null;
}

export interface PlayerGameStatsDto {
  roles: PlayerRoleStatsDto;
  declarer: PlayerDeclarerStatsDto;
  hand: PlayerHandStatsDto;
  defender: PlayerDefenderStatsDto;
  /** One entry per Spielart he played, in the order of the enum. */
  gameTypes: PlayerGameTypeStatsDto[];
  /** The same games as Farbspiel, Grand and Null – always all three. */
  gameTypeGroups: PlayerGameTypeGroupStatsDto[];
}

/** The three groups of the pie, in the order they are reported. */
const GROUP_ORDER: GameTypeGroup[] = ['SUIT', 'GRAND', 'NULL'];

/** Which slice of the pie a Spielart belongs to. */
function groupOf(gameType: GameType): GameTypeGroup {
  if (gameType === 'GRAND') return 'GRAND';
  if (gameType === 'NULL') return 'NULL';
  return 'SUIT';
}

/** Share in percent, rounded to one decimal – `null` without a denominator. */
function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

/** The statistics of one player over the games of the counted lists. */
export function playerGameStats(name: string, games: readonly StatGame[]): PlayerGameStatsDto {
  const own = games.filter((game) => game.players.includes(name));
  const declared = own.filter((game) => game.declarer === name);
  const defended = own.filter((game) => game.declarer !== null && game.declarer !== name);
  const lost = declared.filter((game) => game.won === false);
  const won = declared.length - lost.length;
  const handGames = declared.filter((game) => game.hand);
  const handWon = handGames.filter((game) => game.won === true).length;
  const defenderWon = defended.filter((game) => game.won === false).length;
  // A round the player was at the table in is exactly one of the three roles.
  const passedOut = own.length - declared.length - defended.length;

  const gameTypes = GAME_TYPE_ORDER.map((gameType): PlayerGameTypeStatsDto => {
    const played = declared.filter((game) => game.gameType === gameType);
    const gamesWon = played.filter((game) => game.won === true).length;

    return {
      gameType,
      played: played.length,
      won: gamesWon,
      share: percent(played.length, declared.length),
      winShare: percent(gamesWon, played.length),
    };
  }).filter((entry) => entry.played > 0);

  const gameTypeGroups = GROUP_ORDER.map((group): PlayerGameTypeGroupStatsDto => {
    const played = declared.filter(
      (game) => game.gameType !== null && groupOf(game.gameType) === group,
    );
    const gamesWon = played.filter((game) => game.won === true).length;

    return {
      group,
      played: played.length,
      won: gamesWon,
      share: percent(played.length, declared.length),
      winShare: percent(gamesWon, played.length),
    };
  });

  return {
    roles: {
      played: own.length,
      declarer: declared.length,
      defender: defended.length,
      passedOut,
      declarerShare: percent(declared.length, own.length),
      defenderShare: percent(defended.length, own.length),
      passedOutShare: percent(passedOut, own.length),
    },
    declarer: {
      played: declared.length,
      won,
      lost: lost.length,
      winShare: percent(won, declared.length),
    },
    hand: {
      played: handGames.length,
      won: handWon,
      share: percent(handGames.length, declared.length),
      winShare: percent(handWon, handGames.length),
    },
    defender: {
      played: defended.length,
      won: defenderWon,
      winShare: percent(defenderWon, defended.length),
    },
    gameTypes,
    gameTypeGroups,
  };
}
