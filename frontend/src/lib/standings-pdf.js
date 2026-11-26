// Die aktuelle Rangliste als PDF – dieselben Spalten wie die breite Tabelle am
// Bildschirm, immer in der Sortierung „Alle Spieler mit Gruppen“. Das PDF wird
// erst beim Klick erzeugt; jsPDF ist groß und wird nur hier gebraucht.

const PAGE = { width: 297, height: 210, margin: 12 }
const TABLE_WIDTH = PAGE.width - PAGE.margin * 2
const TABLE_BOTTOM = 190
const ROW_HEIGHT = 10.5
const HEADER_HEIGHT = 14

const COLORS = {
  ink: '#25302b',
  muted: '#7c8178',
  line: '#ded9ce',
  cream: '#fbfaf6',
  stripe: '#f7f3ea',
  header: '#25302b',
  orange: '#b7522d',
}

const COLUMNS = [
  { label: 'Rang', width: 14, align: 'center' },
  { label: 'Spieler', width: 70, align: 'left' },
  { label: 'Spiele', width: 18, align: 'center' },
  { label: 'Ø Punkte', width: 24, align: 'right' },
  { label: 'Ø / 36', width: 24, align: 'right' },
  { label: ['Gewonnene', 'Alleinspiele'], width: 25, align: 'center' },
  { label: ['Verlorene', 'Alleinspiele'], width: 25, align: 'center' },
  { label: 'Gegner', width: 20, align: 'center' },
  { label: ['±', 'Spieltag'], width: 25, align: 'right' },
  { label: 'Gesamt', width: 28, align: 'right' },
]

/** `TT.MM.JJJJ` für Dateiname und Kopfzeile. */
function dateLabel(now = new Date()) {
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${now.getFullYear()}`
}

/** „Aktueller Stand“ oder das gewählte Datum. */
function standingLabel(asOf) {
  return asOf && asOf !== 'current' ? `Stand vom ${asOf.split('-').reverse().join('.')}` : 'Aktueller Stand'
}

function numberLabel(value, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '–'
  return value.toLocaleString('de-DE', { maximumFractionDigits: digits })
}

function signedLabel(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '–'
  if (value > 0) return `+${value}`
  if (value < 0) return `-${Math.abs(value)}`
  return '0'
}

/** Kürzt Text mit Auslassungszeichen, bis er in die Breite passt. */
function shorten(doc, text, maxWidth) {
  const value = String(text ?? '')
  if (doc.getTextWidth(value) <= maxWidth) return value
  let shortened = value
  while (shortened.length > 1 && doc.getTextWidth(`${shortened}…`) > maxWidth) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened.trimEnd()}…`
}

/** Dateiname ohne Zeichen, die Dateisysteme nicht mögen. */
function fileName(tournamentName) {
  const name = String(tournamentName ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
  return `Skatis_Rangliste_${name || 'Turnier'}_${dateLabel()}.pdf`
}

/** Kopf der ersten Seite mit Turniername, Sortierung und Stand. */
function drawPageHeader(doc, { tournamentName, asOf, listsCounted, page }) {
  doc.setTextColor(COLORS.muted)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('SKATIS · RANGLISTE', PAGE.margin, 12)

  if (page === 1) {
    doc.setTextColor(COLORS.ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(19)
    doc.text('Rangliste', PAGE.margin, 21)

    doc.setFontSize(10)
    doc.text(shorten(doc, tournamentName || 'Turnier', 150), PAGE.margin, 28)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(COLORS.muted)
    doc.text(`Alle Spieler mit Gruppen · ${standingLabel(asOf)} · ${listsCounted} gewertete Listen`, PAGE.margin, 34)
    doc.text(`Erstellt am ${dateLabel()}`, PAGE.width - PAGE.margin, 21, { align: 'right' })

    doc.setDrawColor(COLORS.ink)
    doc.setLineWidth(0.4)
    doc.line(PAGE.margin, 38, PAGE.width - PAGE.margin, 38)
    return 44
  }

  doc.setTextColor(COLORS.ink)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`Rangliste · ${shorten(doc, tournamentName || 'Turnier', 170)}`, PAGE.margin, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.muted)
  doc.text(`${standingLabel(asOf)} · Alle Spieler mit Gruppen`, PAGE.width - PAGE.margin, 15, { align: 'right' })
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(PAGE.margin, 19, PAGE.width - PAGE.margin, 19)
  return 25
}

/** Spaltenkopf; wird auf jeder Seite wiederholt. */
function drawTableHeader(doc, y) {
  doc.setFillColor(COLORS.header)
  doc.rect(PAGE.margin, y, TABLE_WIDTH, HEADER_HEIGHT, 'F')
  doc.setTextColor(COLORS.cream)
  doc.setFont('helvetica', 'bold')

  let x = PAGE.margin
  for (const column of COLUMNS) {
    const lines = Array.isArray(column.label) ? column.label : [column.label]
    doc.setFontSize(lines.length > 1 ? 6.2 : 7)
    lines.forEach((line, index) => {
      const lineY = y + 5.7 + index * 3.7
      if (column.align === 'left') doc.text(line, x + 2, lineY)
      else if (column.align === 'right') doc.text(line, x + column.width - 2, lineY, { align: 'right' })
      else doc.text(line, x + column.width / 2, lineY, { align: 'center' })
    })
    x += column.width
  }

  return y + HEADER_HEIGHT
}

/** Eine Zeile mit denselben Werten wie die Desktop-Rangliste. */
function drawRow(doc, y, player, index) {
  if (index % 2 === 1) {
    doc.setFillColor(COLORS.stripe)
    doc.rect(PAGE.margin, y, TABLE_WIDTH, ROW_HEIGHT, 'F')
  }

  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.15)
  doc.line(PAGE.margin, y + ROW_HEIGHT, PAGE.width - PAGE.margin, y + ROW_HEIGHT)

  const values = [
    player.rank === null || player.rank === undefined ? '–' : String(player.rank),
    null,
    numberLabel(player.gamesPlayed),
    numberLabel(player.averageScore, 1),
    numberLabel(player.averageScorePer36, 1),
    numberLabel(player.won),
    numberLabel(player.lost),
    numberLabel(player.opponentWon),
    signedLabel(player.lastMatchdayChange),
    numberLabel(player.score),
  ]

  let x = PAGE.margin
  COLUMNS.forEach((column, columnIndex) => {
    if (columnIndex === 1) {
      const group = player.group?.name
      const nameWidth = group ? column.width - 27 : column.width - 4
      doc.setTextColor(COLORS.ink)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.3)
      const name = shorten(doc, player.name ?? '', nameWidth)
      const nameTextWidth = doc.getTextWidth(name)
      doc.text(name, x + 2, y + 6.8)

      if (group) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.2)
        doc.setTextColor(COLORS.muted)
        const groupWidth = Math.max(5, column.width - 4 - nameTextWidth - 4)
        doc.text(`· ${shorten(doc, group, groupWidth)}`, x + 2 + nameTextWidth + 1.5, y + 6.8)
      }
    } else {
      const value = values[columnIndex]
      doc.setTextColor(COLORS.ink)
      doc.setFont('helvetica', columnIndex === 9 ? 'bold' : 'normal')
      doc.setFontSize(columnIndex === 9 ? 8.5 : 7.5)
      if (column.align === 'left') doc.text(value, x + 2, y + 6.8)
      else if (column.align === 'right') doc.text(value, x + column.width - 2, y + 6.8, { align: 'right' })
      else doc.text(value, x + column.width / 2, y + 6.8, { align: 'center' })
    }
    x += column.width
  })
}

/** Fußzeile mit Seitenzahl. */
function drawFooter(doc, page) {
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(PAGE.margin, 196, PAGE.width - PAGE.margin, 196)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(COLORS.muted)
  doc.text('Skatis · Rangliste · Sortierung „Alle Spieler mit Gruppen“', PAGE.margin, 201)
  doc.text(`Seite ${page}`, PAGE.width - PAGE.margin, 201, { align: 'right' })
}

const FEATURE_LABELS = {
  hand: 'Hand',
  offen: 'Offen',
  schneiderAnnounced: 'Schneider Ang.',
  schwarzAnnounced: 'Schwarz Ang.',
  schneider: 'Schneider',
  schwarz: 'Schwarz',
}

const FEATURE_TABLES = [
  { title: 'Hand und Offen', keys: ['hand', 'offen'], excludeNull: false },
  {
    title: 'Angesagt und gespielt',
    keys: ['schneiderAnnounced', 'schwarzAnnounced', 'schneider', 'schwarz'],
    excludeNull: true,
  },
]

function percentLabel(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '–'
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`
}

/** Kopf einer Statistikseite. */
function drawStatisticsHeader(doc, { tournamentName, statistics }) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.muted)
  doc.text('SKATIS · TURNIERSTATISTIK', PAGE.margin, 12)

  doc.setTextColor(COLORS.ink)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.text('Turnierstatistik', PAGE.margin, 21)

  doc.setFontSize(10)
  doc.text(shorten(doc, tournamentName || 'Turnier', 150), PAGE.margin, 28)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(COLORS.muted)
  doc.text(
    `${statistics.listsCounted} gewertete Listen · ${statistics.matchdaysCounted} Spieltage`,
    PAGE.width - PAGE.margin,
    21,
    { align: 'right' },
  )

  doc.setDrawColor(COLORS.ink)
  doc.setLineWidth(0.4)
  doc.line(PAGE.margin, 32, PAGE.width - PAGE.margin, 32)
}

/** Eine Kennzahlbox auf der Statistikseite. */
function drawKpiBox(doc, { x, y, width, height, label, value, note }) {
  doc.setFillColor(COLORS.stripe)
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.2)
  doc.rect(x, y, width, height, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.muted)
  doc.text(label.toUpperCase(), x + 3, y + 4.5)

  doc.setFontSize(15)
  doc.setTextColor(COLORS.ink)
  doc.text(String(value), x + 3, y + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.muted)
  doc.text(shorten(doc, note, width - 6), x + 3, y + 14.5)
}

/** Erste Statistikseite: Kennzahlen, Ergebnisse und Spielarten. */
function drawStatisticsOverview(doc, { tournamentName, statistics }) {
  drawStatisticsHeader(doc, { tournamentName, statistics })

  const winQuote = statistics.playedGames > 0
    ? (statistics.outcomes.won / statistics.playedGames) * 100
    : null
  const boxes = [
    {
      label: 'Spiele insgesamt',
      value: statistics.totalGames,
      note: `${statistics.passedOutGames} eingepasst`,
    },
    {
      label: 'Alleinspiele',
      value: statistics.playedGames,
      note: 'gewonnen oder verloren',
    },
    {
      label: 'Gewinnquote',
      value: percentLabel(winQuote),
      note: `${statistics.outcomes.won} von ${statistics.playedGames}`,
    },
    {
      label: 'Spieltage',
      value: statistics.matchdaysCounted,
      note: `aus ${statistics.listsCounted} Listen`,
    },
  ]

  const boxY = 38
  const boxGap = 4
  const boxWidth = (TABLE_WIDTH - boxGap * 3) / 4
  boxes.forEach((box, index) => {
    drawKpiBox(doc, {
      x: PAGE.margin + index * (boxWidth + boxGap),
      y: boxY,
      width: boxWidth,
      height: 17,
      ...box,
    })
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.ink)
  doc.text('Ergebnisverteilung', PAGE.margin, 64)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  const outcomes = [
    ['Gewonnen', statistics.outcomes.won, statistics.outcomes.wonShare],
    ['Verloren', statistics.outcomes.lost, statistics.outcomes.lostShare],
    ['Eingepasst', statistics.outcomes.passedOut, statistics.outcomes.passedOutShare],
  ]
  const segmentWidth = TABLE_WIDTH / 3
  outcomes.forEach(([label, count, share], index) => {
    const x = PAGE.margin + index * segmentWidth
    doc.setTextColor(COLORS.ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(`${label}: ${percentLabel(share)}`, x, 71)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(COLORS.muted)
    doc.text(`${count} Spiele`, x, 75.5)
  })

  const barY = 79
  const wonWidth = ((statistics.outcomes.wonShare ?? 0) / 100) * TABLE_WIDTH
  const lostWidth = ((statistics.outcomes.lostShare ?? 0) / 100) * TABLE_WIDTH
  const passedWidth = ((statistics.outcomes.passedOutShare ?? 0) / 100) * TABLE_WIDTH
  doc.setFillColor('#4d7957')
  doc.rect(PAGE.margin, barY, wonWidth, 3, 'F')
  doc.setFillColor('#bf5142')
  doc.rect(PAGE.margin + wonWidth, barY, lostWidth, 3, 'F')
  doc.setFillColor('#b8b1a2')
  doc.rect(PAGE.margin + wonWidth + lostWidth, barY, passedWidth, 3, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.ink)
  doc.text('Spielarten', PAGE.margin, 91)

  const columns = [
    { label: 'Spielart', width: 72, align: 'left' },
    { label: 'Gespielt', width: 45, align: 'center' },
    { label: 'Gewonnen', width: 35, align: 'center' },
    { label: 'Verloren', width: 35, align: 'center' },
    { label: 'Anteil', width: 40, align: 'right' },
    { label: 'Gewinnquote', width: 46, align: 'right' },
  ]
  let y = 95
  doc.setFillColor(COLORS.header)
  doc.rect(PAGE.margin, y, TABLE_WIDTH, 8, 'F')
  doc.setTextColor(COLORS.cream)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.3)
  let headerX = PAGE.margin
  for (const column of columns) {
    const textX = column.align === 'left' ? headerX + 2 : column.align === 'right' ? headerX + column.width - 2 : headerX + column.width / 2
    doc.text(column.label, textX, y + 5.2, { align: column.align === 'left' ? 'left' : column.align === 'right' ? 'right' : 'center' })
    headerX += column.width
  }
  y += 8

  statistics.gameTypes.forEach((entry, index) => {
    if (index % 2 === 1) {
      doc.setFillColor(COLORS.stripe)
      doc.rect(PAGE.margin, y, TABLE_WIDTH, 7, 'F')
    }
    const values = [
      entry.gameType,
      String(entry.played),
      String(entry.won),
      String(entry.lost),
      percentLabel(entry.share),
      percentLabel(entry.winShare),
    ]
    doc.setTextColor(COLORS.ink)
    doc.setFont('helvetica', index === 0 ? 'bold' : 'normal')
    doc.setFontSize(7)
    let x = PAGE.margin
    columns.forEach((column, columnIndex) => {
      const textX = column.align === 'left' ? x + 2 : column.align === 'right' ? x + column.width - 2 : x + column.width / 2
      doc.text(values[columnIndex], textX, y + 4.8, { align: column.align === 'left' ? 'left' : column.align === 'right' ? 'right' : 'center' })
      x += column.width
    })
    doc.setDrawColor(COLORS.line)
    doc.setLineWidth(0.12)
    doc.line(PAGE.margin, y + 7, PAGE.width - PAGE.margin, y + 7)
    y += 7
  })

  const groups = statistics.gameTypeGroups
    .filter((group) => group.played > 0)
    .map((group) => `${group.group === 'SUIT' ? 'Farbspiel' : group.group === 'GRAND' ? 'Grand' : 'Null'} ${percentLabel(group.winShare)}`)
    .join(' · ')
  if (groups) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(COLORS.muted)
    doc.text(`Gewinnquote nach Gruppe: ${groups}`, PAGE.margin, y + 6)
  }
}

/** Eine Verteilungstabelle mit Anzahl, Anteil und Gewinnquote je Zelle. */
function drawFeatureTable(doc, { y, title, keys, types, statistics }) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(COLORS.ink)
  doc.text(title, PAGE.margin, y)

  const firstWidth = 50
  const columnWidth = (TABLE_WIDTH - firstWidth) / keys.length
  const headerHeight = 9
  const rowHeight = 9.5
  let tableY = y + 4

  doc.setFillColor(COLORS.header)
  doc.rect(PAGE.margin, tableY, TABLE_WIDTH, headerHeight, 'F')
  doc.setTextColor(COLORS.cream)
  doc.setFontSize(6.3)
  doc.text('Spielart', PAGE.margin + 2, tableY + 5.5)
  const featureByKey = new Map(statistics.features.map((feature) => [feature.key, feature]))
  keys.forEach((key, index) => {
    const x = PAGE.margin + firstWidth + index * columnWidth
    doc.text(`${FEATURE_LABELS[key] ?? key} · ${featureByKey.get(key)?.total ?? 0}×`, x + columnWidth / 2, tableY + 5.5, { align: 'center' })
  })
  tableY += headerHeight

  types.forEach((entry, rowIndex) => {
    if (rowIndex % 2 === 1) {
      doc.setFillColor(COLORS.stripe)
      doc.rect(PAGE.margin, tableY, TABLE_WIDTH, rowHeight, 'F')
    }
    doc.setTextColor(COLORS.ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(entry.gameType, PAGE.margin + 2, tableY + 5.8)

    keys.forEach((key, index) => {
      const feature = featureByKey.get(key)
      const cell = feature?.byGameType.find((value) => value.gameType === entry.gameType) ?? {
        count: 0,
        share: null,
        winShare: null,
      }
      const x = PAGE.margin + firstWidth + index * columnWidth + columnWidth / 2
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6)
      doc.setTextColor(COLORS.ink)
      doc.text(`${cell.count}×`, x, tableY + 3.2, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.3)
      doc.setTextColor(COLORS.muted)
      doc.text(`${percentLabel(cell.share)} Anteil`, x, tableY + 6.1, { align: 'center' })
      doc.setTextColor('#4d7957')
      doc.text(`${percentLabel(cell.winShare)} gewonnen`, x, tableY + 8.8, { align: 'center' })
    })

    doc.setDrawColor(COLORS.line)
    doc.setLineWidth(0.12)
    doc.line(PAGE.margin, tableY + rowHeight, PAGE.width - PAGE.margin, tableY + rowHeight)
    tableY += rowHeight
  })

  return tableY
}

/** Zweite Statistikseite: die beiden Verteilungstabellen. */
function drawStatisticsFeatures(doc, { tournamentName, statistics }) {
  drawStatisticsHeader(doc, { tournamentName, statistics })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.ink)
  doc.text('Verteilung der Gewinnstufen', PAGE.margin, 39)

  let y = 46
  FEATURE_TABLES.forEach(({ title, keys, excludeNull }) => {
    const types = statistics.gameTypes.filter(
      (entry) => entry.played > 0 && (!excludeNull || entry.gameType !== 'NULL'),
    )
    if (types.length === 0) return
    y = drawFeatureTable(doc, { y, title, keys, types, statistics }) + 7
  })
}

/**
 * Lädt die aktuelle Rangliste als PDF herunter. `standing` muss bereits mit
 * `?grouped=true` geladen sein; die Reihenfolge der Antwort wird unverändert
 * übernommen. Mit `statistics` folgen die Turnierstatistiken nach der Tabelle.
 * Liefert `false`, wenn es keine Spieler gibt.
 */
export async function downloadStandingsPdf({ standing, statistics, tournament, asOf = 'current' }) {
  const players = standing?.players ?? []
  if (!players.length) return false

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })
  const tournamentName = tournament?.name ?? ''
  let page = 1
  let y = drawPageHeader(doc, {
    tournamentName,
    asOf,
    listsCounted: standing?.listsCounted ?? 0,
    page,
  })
  y = drawTableHeader(doc, y)

  players.forEach((player, index) => {
    if (y + ROW_HEIGHT > TABLE_BOTTOM) {
      drawFooter(doc, page)
      doc.addPage()
      page += 1
      y = drawPageHeader(doc, {
        tournamentName,
        asOf,
        listsCounted: standing?.listsCounted ?? 0,
        page,
      })
      y = drawTableHeader(doc, y)
    }
    drawRow(doc, y, player, index)
    y += ROW_HEIGHT
  })

  drawFooter(doc, page)

  if (statistics) {
    doc.addPage()
    page += 1
    drawStatisticsOverview(doc, { tournamentName, statistics })
    drawFooter(doc, page)

    doc.addPage()
    page += 1
    drawStatisticsFeatures(doc, { tournamentName, statistics })
    drawFooter(doc, page)
  }

  await doc.save(fileName(tournamentName))
  return true
}
