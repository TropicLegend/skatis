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

const GAME_TYPE_LABELS = {
  KARO: 'Karo',
  HERZ: 'Herz',
  PIK: 'Pik',
  KREUZ: 'Kreuz',
  GRAND: 'Grand',
  NULL: 'Null',
}

const GAME_TYPE_COLORS = {
  KARO: '#c99a3d',
  HERZ: '#c55c55',
  PIK: '#4f745a',
  KREUZ: '#395a6b',
  GRAND: '#db6f40',
  NULL: '#7d6a9c',
}

const OUTCOME_COLORS = {
  won: '#4d7957',
  lost: '#bf5142',
  passedOut: '#b8b1a2',
}

const GROUP_COLORS = {
  SUIT: '#527b78',
  GRAND: '#db6f40',
  NULL: '#7d6a9c',
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
function drawKpiBox(doc, { x, y, width, height, label, value, note, color = COLORS.ink }) {
  doc.setFillColor('#fffdf9')
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, width, height, 2.5, 2.5, 'FD')
  doc.setFillColor(color)
  doc.rect(x, y, width, 1.4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.muted)
  doc.text(label.toUpperCase(), x + 3, y + 5.2)

  doc.setFontSize(16)
  doc.setTextColor(COLORS.ink)
  doc.text(String(value), x + 3, y + 12.3)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.muted)
  doc.text(shorten(doc, note, width - 6), x + 3, y + 16)
}

/** Zeichnet ein Donut-Diagramm aus einfachen Dreiecken – ohne Zusatzbibliothek. */
function drawDonutChart(doc, { cx, cy, radius, thickness = 7, slices, centerValue, centerLabel }) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0)
  if (total <= 0) return

  let angle = -Math.PI / 2
  for (const slice of slices) {
    const value = Math.max(0, slice.value)
    if (value === 0) continue
    const end = angle + (value / total) * Math.PI * 2
    const steps = Math.max(6, Math.ceil((end - angle) / 0.07))
    doc.setFillColor(slice.color)
    let previous = angle
    for (let index = 1; index <= steps; index += 1) {
      const next = angle + (end - angle) * (index / steps)
      doc.triangle(
        cx,
        cy,
        cx + radius * Math.cos(previous),
        cy + radius * Math.sin(previous),
        cx + radius * Math.cos(next),
        cy + radius * Math.sin(next),
        'F',
      )
      previous = next
    }
    angle = end
  }

  doc.setFillColor('#ffffff')
  doc.circle(cx, cy, radius - thickness, 'F')
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.25)
  doc.circle(cx, cy, radius, 'S')

  doc.setTextColor(COLORS.ink)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(String(centerValue), cx, cy + 1, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.setTextColor(COLORS.muted)
  doc.text(centerLabel, cx, cy + 5, { align: 'center' })
}

/** Ein Donut-Panel mit Titel und einer Legende aus drei Zeilen. */
function drawDonutPanel(doc, { x, y, width, height, title, note, slices, centerValue, centerLabel }) {
  doc.setFillColor('#fffdf9')
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, width, height, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.ink)
  doc.text(title, x + 4, y + 7)
  if (note) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(COLORS.muted)
    doc.text(note, x + 4, y + 11)
  }

  const cx = x + 25
  const cy = y + height / 2 + 2
  drawDonutChart(doc, {
    cx,
    cy,
    radius: 18,
    slices,
    centerValue,
    centerLabel,
  })

  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  let legendY = y + 17
  for (const slice of slices) {
    const share = total === 0 ? '–' : percentLabel((slice.value / total) * 100)
    doc.setFillColor(slice.color)
    doc.rect(x + 49, legendY - 2.7, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(COLORS.ink)
    doc.text(slice.label, x + 55, legendY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(COLORS.muted)
    doc.text(`${slice.value} Spiele`, x + 55, legendY + 3.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(COLORS.ink)
    doc.text(share, x + width - 4, legendY, { align: 'right' })
    legendY += 10.5
  }
}

/** Erste Statistikseite: Kennzahlen, Ergebnis- und Spielarten-Pies, Gewinnquoten. */
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
      color: '#527b78',
    },
    {
      label: 'Alleinspiele',
      value: statistics.playedGames,
      note: 'gewonnen oder verloren',
      color: '#4d7957',
    },
    {
      label: 'Gewinnquote',
      value: percentLabel(winQuote),
      note: `${statistics.outcomes.won} von ${statistics.playedGames}`,
      color: '#db6f40',
    },
    {
      label: 'Spieltage',
      value: statistics.matchdaysCounted,
      note: `aus ${statistics.listsCounted} Listen`,
      color: '#7d6a9c',
    },
  ]

  const boxGap = 4
  const boxWidth = (TABLE_WIDTH - boxGap * 3) / 4
  boxes.forEach((box, index) => {
    drawKpiBox(doc, {
      x: PAGE.margin + index * (boxWidth + boxGap),
      y: 38,
      width: boxWidth,
      height: 20,
      ...box,
    })
  })

  const panelY = 65
  const panelHeight = 53
  const panelGap = 8
  const panelWidth = (TABLE_WIDTH - panelGap) / 2
  drawDonutPanel(doc, {
    x: PAGE.margin,
    y: panelY,
    width: panelWidth,
    height: panelHeight,
    title: 'Ergebnisverteilung',
    note: 'Gewonnen, verloren und eingepasst',
    slices: [
      { label: 'Gewonnen', value: statistics.outcomes.won, color: OUTCOME_COLORS.won },
      { label: 'Verloren', value: statistics.outcomes.lost, color: OUTCOME_COLORS.lost },
      { label: 'Eingepasst', value: statistics.outcomes.passedOut, color: OUTCOME_COLORS.passedOut },
    ],
    centerValue: statistics.totalGames,
    centerLabel: 'Spiele',
  })
  drawDonutPanel(doc, {
    x: PAGE.margin + panelWidth + panelGap,
    y: panelY,
    width: panelWidth,
    height: panelHeight,
    title: 'Spielarten',
    note: 'Anteil der entschiedenen Alleinspiele',
    slices: statistics.gameTypeGroups.map((group) => ({
      label: group.group === 'SUIT' ? 'Farbspiel' : group.group === 'GRAND' ? 'Grand' : 'Null',
      value: group.played,
      color: GROUP_COLORS[group.group] ?? COLORS.muted,
    })),
    centerValue: statistics.playedGames,
    centerLabel: 'Alleinspiele',
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.ink)
  doc.text('Gewinnquote je Spielart', PAGE.margin, 127)

  const columns = [
    { label: 'Spielart', width: 72, align: 'left' },
    { label: 'Gespielt', width: 45, align: 'center' },
    { label: 'Gewonnen', width: 35, align: 'center' },
    { label: 'Verloren', width: 35, align: 'center' },
    { label: 'Anteil', width: 40, align: 'right' },
    { label: 'Gewinnquote', width: 46, align: 'right' },
  ]
  let y = 131
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
      null,
      String(entry.played),
      String(entry.won),
      String(entry.lost),
      percentLabel(entry.share),
      percentLabel(entry.winShare),
    ]
    doc.setFillColor(GAME_TYPE_COLORS[entry.gameType] ?? COLORS.muted)
    doc.rect(PAGE.margin + 2, y + 2.2, 2.6, 2.6, 'F')
    doc.setTextColor(COLORS.ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(GAME_TYPE_LABELS[entry.gameType] ?? entry.gameType, PAGE.margin + 6, y + 4.8)
    let x = PAGE.margin + columns[0].width
    columns.slice(1).forEach((column, columnIndex) => {
      doc.setFont('helvetica', columnIndex === 4 ? 'bold' : 'normal')
      const value = values[columnIndex + 1]
      const textX = column.align === 'right' ? x + column.width - 2 : x + column.width / 2
      doc.text(value, textX, y + 4.8, { align: column.align === 'right' ? 'right' : 'center' })
      x += column.width
    })
    doc.setDrawColor(COLORS.line)
    doc.setLineWidth(0.12)
    doc.line(PAGE.margin, y + 7, PAGE.width - PAGE.margin, y + 7)
    y += 7
  })
}

/** Ein Donut-Panel für eine Gewinnstufe mit Spielarten-Legende. */
function drawFeaturePanel(doc, { x, y, width, height, key, feature, types, radius }) {
  doc.setFillColor('#fffdf9')
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, width, height, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(COLORS.ink)
  doc.text(FEATURE_LABELS[key] ?? key, x + 4, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.muted)
  doc.text(`${feature?.total ?? 0} Spiele mit dieser Stufe`, x + 4, y + 11)

  const byType = new Map((feature?.byGameType ?? []).map((entry) => [entry.gameType, entry]))
  const slices = types.map((gameType) => ({
    gameType,
    label: GAME_TYPE_LABELS[gameType] ?? gameType,
    value: byType.get(gameType)?.count ?? 0,
    color: GAME_TYPE_COLORS[gameType] ?? COLORS.muted,
  }))
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const cx = x + 27
  const cy = y + height / 2 + 3
  if (total === 0) {
    doc.setFillColor('#f1eee6')
    doc.circle(cx, cy, radius, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(COLORS.muted)
    doc.text('0', cx, cy + 1, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.5)
    doc.text('Spiele', cx, cy + 5, { align: 'center' })
  } else {
    drawDonutChart(doc, {
      cx,
      cy,
      radius,
      slices,
      centerValue: total,
      centerLabel: 'Spiele',
    })
  }

  const legendStep = height <= 70 ? 8.7 : 10
  let legendY = y + 14
  for (const slice of slices) {
    const entry = byType.get(slice.gameType) ?? null
    const share = total === 0 ? null : (slice.value / total) * 100
    doc.setFillColor(slice.color)
    doc.rect(x + 52, legendY - 2.7, 3, 3, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(COLORS.ink)
    doc.text(slice.label, x + 58, legendY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.8)
    doc.setTextColor(COLORS.muted)
    doc.text(`${percentLabel(share)} Anteil · ${percentLabel(entry?.winShare)} gewonnen`, x + 58, legendY + 3.3)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(COLORS.ink)
    doc.text(`${slice.value}×`, x + width - 4, legendY, { align: 'right' })
    legendY += legendStep
  }
}

/** Eine Statistikseite mit Donut-Charts für eine Gruppe von Gewinnstufen. */
function drawStatisticsFeaturePage(doc, { tournamentName, statistics, title, keys, excludeNull }) {
  drawStatisticsHeader(doc, { tournamentName, statistics })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(COLORS.ink)
  doc.text(title, PAGE.margin, 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(COLORS.muted)
  doc.text(
    'Anteile je Spielart, dazu die Gewinnquote innerhalb der jeweiligen Spielart.',
    PAGE.margin,
    45,
  )

  const types = statistics.gameTypes
    .filter((entry) => entry.played > 0 && (!excludeNull || entry.gameType !== 'NULL'))
    .map((entry) => entry.gameType)
  if (types.length === 0) {
    doc.setFontSize(9)
    doc.text('Noch keine passenden entschiedenen Alleinspiele eingetragen.', PAGE.margin, 62)
    return
  }

  const featureByKey = new Map(statistics.features.map((feature) => [feature.key, feature]))
  const gap = 8
  const width = (TABLE_WIDTH - gap) / 2
  const height = keys.length === 2 ? 92 : 64
  const rowGap = 8
  keys.forEach((key, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    drawFeaturePanel(doc, {
      x: PAGE.margin + column * (width + gap),
      y: 52 + row * (height + rowGap),
      width,
      height,
      key,
      feature: featureByKey.get(key),
      types,
      radius: keys.length === 2 ? 23 : 18,
    })
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

    FEATURE_TABLES.forEach(({ title, keys, excludeNull }) => {
      doc.addPage()
      page += 1
      drawStatisticsFeaturePage(doc, { tournamentName, statistics, title, keys, excludeNull })
      drawFooter(doc, page)
    })
  }

  await doc.save(fileName(tournamentName))
  return true
}
