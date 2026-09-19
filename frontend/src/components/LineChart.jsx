import React from 'react'

/**
 * A small line chart in plain SVG – no charting library, no extra dependency.
 *
 * `labels` are the points of the time axis ("Start", "R1", "KW 38", …) and every
 * series carries one value per label. Lines are drawn with the colours of the
 * series, the zero line is emphasised because a Skat account can go negative.
 */

const WIDTH = 720
const DEFAULT_HEIGHT = 280
const MARGIN = { top: 16, right: 22, bottom: 34, left: 52 }

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

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const x = (index) =>
    labels.length === 1 ? MARGIN.left + plotWidth / 2 : MARGIN.left + (index * plotWidth) / (labels.length - 1)
  const y = (value) => MARGIN.top + plotHeight - ((value - low) / (high - low || 1)) * plotHeight

  // Only every n-th tick is labelled, so long lists stay readable.
  const labelEvery = Math.max(1, Math.ceil(labels.length / 9))
  const showLabel = (_, index) => index === 0 || index === labels.length - 1 || index % labelEvery === 0

  return (
    <figure className="chart">
      <svg
        className="chart-canvas"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={`Punkteentwicklung von ${drawn.map((serie) => serie.name).join(', ')}`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={tick === 0 ? 'chart-zero' : 'chart-grid'}
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-tick" x={MARGIN.left - 10} y={y(tick) + 4} textAnchor="end">
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
              y={height - MARGIN.bottom + 20}
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
              <circle key={index} className="chart-point" cx={x(index)} cy={y(value)} style={{ fill: serie.color }}>
                <title>{`${serie.name} · ${labels[index]}: ${format(value)} ${unit}`}</title>
              </circle>
            ))}
          </g>
        ))}
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
    </figure>
  )
}

export default LineChart
