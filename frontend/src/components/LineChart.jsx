import React, { useState } from 'react'
import { useMobile } from '../lib/useMedia.js'

/**
 * A small line chart in plain SVG – no charting library, no extra dependency.
 *
 * `labels` are the points of the time axis ("Start", "R1", "KW 38", …) and every
 * series carries one value per label. Lines are drawn with the colours of the
 * series, the zero line is emphasised because a Skat account can go negative.
 * Hovering a time point shows a box with the value every series reached there.
 */

const WIDTH = 720
const DEFAULT_HEIGHT = 280
const MARGIN = { top: 16, right: 22, bottom: 34, left: 52 }
/**
 * Handy-Maße: ein kleineres Koordinatensystem wird auf die gleiche Breite gezogen,
 * also wird die Beschriftung im Verhältnis größer statt winzig. Der linke Rand
 * bleibt breit genug für die Zahlen der Achse.
 */
const WIDTH_MOBILE = 430
const MARGIN_MOBILE = { top: 14, right: 16, bottom: 32, left: 62 }

/** Rounds a rough step up to a readable value: 1, 2, 2.5, 5, 10, 20, 25, … */
function niceStep(rough) {
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1)))
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (rough <= factor * power) return factor * power
  }
  return 10 * power
}

/** The last value that is not a gap – what the legend shows for a series. */
function lastValue(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] !== null) return values[index]
  }
  return 0
}

/** Tick values that cover `min..max` with a readable step. */
function niceTicks(min, max, count = 4) {
  const step = niceStep((max - min) / count)
  const low = Math.floor(min / step) * step
  const high = Math.ceil(max / step) * step
  const values = []
  for (let value = low; value <= high + step / 1000; value += step) {
    values.push(Math.round(value * 1000) / 1000)
  }
  return { low, high: Math.max(high, low + step), values }
}

function LineChart({ labels = [], series = [], height = DEFAULT_HEIGHT, unit = 'Punkte', emptyHint }) {
  const [hover, setHover] = useState(null)
  const mobile = useMobile()
  const width = mobile ? WIDTH_MOBILE : WIDTH
  const margin = mobile ? MARGIN_MOBILE : MARGIN
  const chartHeight = mobile ? Math.min(height, 236) : height
  // A series may have gaps (`null`) – a player without a game has no average.
  // A series without a single value would draw nothing, so it is dropped.
  const drawn = series
    .filter((serie) => Array.isArray(serie.values) && serie.values.length === labels.length)
    .map((serie) => ({ ...serie, values: serie.values.map((value) => (Number.isFinite(value) ? value : null)) }))
    .filter((serie) => serie.values.some((value) => value !== null))
  const values = drawn.flatMap((serie) => serie.values).filter((value) => Number.isFinite(value))
  const format = (value) => Number(value).toLocaleString('de-DE')

  if (labels.length === 0 || drawn.length === 0 || values.length === 0) {
    return <div className="chart-empty">{emptyHint ?? `Noch keine ${unit} zum Zeichnen.`}</div>
  }

  const { low, high, values: ticks } = niceTicks(Math.min(0, ...values), Math.max(0, ...values))

  const plotWidth = width - margin.left - margin.right
  const plotHeight = chartHeight - margin.top - margin.bottom
  const x = (index) =>
    labels.length === 1 ? margin.left + plotWidth / 2 : margin.left + (index * plotWidth) / (labels.length - 1)
  const y = (value) => margin.top + plotHeight - ((value - low) / (high - low || 1)) * plotHeight
  // Antippen oder ziehen wählt einen Zeitpunkt – auf dem Handy genau wie der Zeiger
  // am Desktop. `touch-action: pan-y` lässt Scrollen weiter zu.
  function pick(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width) return
    const offset = ((event.clientX - rect.left) / rect.width) * width - margin.left
    const index = labels.length === 1 ? 0 : Math.round(offset / step)
    setHover(Math.max(0, Math.min(labels.length - 1, index)))
  }

  // Only every n-th tick is labelled, so long lists stay readable.
  const labelEvery = Math.max(1, Math.ceil(labels.length / 9))
  const showLabel = (_, index) => index === 0 || index === labels.length - 1 || index % labelEvery === 0

  // Gehovert wird eine ganze Spalte der Zeitachse: dann steht im Kästchen, welche
  // Punkte bzw. Durchschnittspunkte die Spieler zu diesem Zeitpunkt hatten.
  const step = labels.length === 1 ? plotWidth : plotWidth / (labels.length - 1)
  const hovered = hover !== null && hover < labels.length ? hover : null
  const hoverRows = hovered === null
    ? []
    : drawn
        .filter((serie) => serie.values[hovered] !== null)
        .map((serie) => ({ name: serie.name, color: serie.color, value: serie.values[hovered] }))
  const tooltipLines = [String(labels[hovered] ?? ''), ...hoverRows.map((row) => `${row.name}  ${format(row.value)}`)]
  const tooltipWidth = Math.min(240, Math.max(112, Math.max(0, ...tooltipLines.map((line) => line.length)) * 6 + 26))
  const tooltipHeight = 26 + hoverRows.length * 15
  const tooltipLeft = Math.min(
    Math.max(x(hovered ?? 0) - tooltipWidth / 2, margin.left - 12),
    width - margin.right + 12 - tooltipWidth,
  )

  return (
    <figure className="chart">
      <svg
        className="chart-canvas"
        viewBox={`0 0 ${width} ${chartHeight}`}
        style={{ touchAction: mobile ? 'pan-y' : undefined }}
        onPointerDown={pick}
        onPointerMove={(event) => { if (event.buttons > 0 || event.pointerType === 'touch') pick(event) }}
        role="img"
        aria-label={`Punkteentwicklung von ${drawn.map((serie) => serie.name).join(', ')}`}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'chart-zero' : 'chart-grid'}
              x1={margin.left}
              x2={width - margin.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-tick" x={margin.left - 10} y={y(tick) + 4} textAnchor="end">
              {format(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, index) =>
          showLabel(label, index) ? (
            <text
              key={`label-${index}`}
              className="chart-tick"
              x={x(index)}
              y={chartHeight - margin.bottom + 20}
              textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
            >
              {label}
            </text>
          ) : null,
        )}

        {drawn.map((serie) => (
          <g key={serie.name}>
            <polyline
              className="chart-line"
              points={serie.values.flatMap((value, index) => (value === null ? [] : [`${x(index)},${y(value)}`])).join(' ')}
              style={{ stroke: serie.color }}
            />
            {serie.values.map((value, index) => value === null ? null : (
              <circle key={index} className="chart-point" style={{ fill: serie.color, '--i': index }} cx={x(index)} cy={y(value)} />
            ))}
          </g>
        ))}

        {labels.map((label, index) => {
          // Ein unsichtbares Band je Zeitpunkt fängt den Zeiger ein.
          const left = Math.max(margin.left - 12, x(index) - step / 2)
          const right = Math.min(width - margin.right + 12, x(index) + step / 2)
          return (
            <rect
              key={`hover-${index}`}
              className="chart-band"
              x={left}
              y={MARGIN.top}
              width={Math.max(8, right - left)}
              height={plotHeight}
              onPointerEnter={() => setHover(index)}
            />
          )
        })}

        {!mobile && hovered !== null && (
          <g className="chart-hover" pointerEvents="none">
            <line
              className="chart-guide"
              x1={x(hovered)}
              x2={x(hovered)}
              y1={margin.top}
              y2={margin.top + plotHeight}
            />
            {hoverRows.map((row) => (
              <circle key={row.name} className="chart-hover-point" cx={x(hovered)} cy={y(row.value)} r={4} style={{ fill: row.color }} />
            ))}
            <g className="chart-tooltip">
              <rect x={tooltipLeft} y={margin.top} width={tooltipWidth} height={tooltipHeight} rx={7} />
              <text className="chart-tooltip-title" x={tooltipLeft + 12} y={margin.top + 17}>{labels[hovered]}</text>
              {hoverRows.map((row, index) => (
                <g key={row.name}>
                  <rect
                    className="chart-tooltip-swatch"
                    x={tooltipLeft + 12}
                    y={margin.top + 27 + index * 15}
                    width={7}
                    height={7}
                    rx={2}
                    style={{ fill: row.color }}
                  />
                  <text className="chart-tooltip-row" x={tooltipLeft + 25} y={margin.top + 34 + index * 15}>{row.name}</text>
                  <text
                    className="chart-tooltip-value"
                    x={tooltipLeft + tooltipWidth - 12}
                    y={margin.top + 34 + index * 15}
                    textAnchor="end"
                  >
                    {format(row.value)}
                  </text>
                </g>
              ))}
            </g>
          </g>
        )}
      </svg>

      <figcaption className="chart-legend">
        {drawn.map((serie) => (
          <span className="chart-legend-item" key={serie.name}>
            <i style={{ background: serie.color }} />
            {serie.name}
            <strong>{format(lastValue(serie.values))}</strong>
          </span>
        ))}
      </figcaption>

      {/* Am Handy steht die Auskunft unter dem Diagramm statt über den Daten: größer
          zu lesen und mit dem Finger nicht zu treffen. */}
      {mobile && (
        <div className="chart-touch" aria-live="polite">
          {hovered === null
            ? <span className="chart-touch-hint">Zeitpunkt antippen oder ziehen, um die Werte zu sehen.</span>
            : <>
                <span className="chart-touch-title">{labels[hovered]}</span>
                {hoverRows.map((row) => <span key={row.name} className="chart-touch-row"><i style={{ background: row.color }} />{row.name}<strong>{format(row.value)}</strong></span>)}
              </>}
        </div>
      )}
    </figure>
  )
}

export default LineChart
