import React, { useState } from 'react'

/**
 * A donut chart in plain SVG – no charting library, no extra dependency.
 *
 * `slices` carry a label, a value and a colour; the chart draws them as arcs of a
 * ring and writes the total in the middle. Slices without a value are dropped, so
 * a legend never lists a part that does not exist. Hovering an arc or its legend
 * entry highlights both and names the share.
 */

const SIZE = 220
const CENTER = SIZE / 2
const RADIUS = 78
const THICKNESS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** Small gap between two slices so the parts stay distinguishable. */
const GAP = 4

function PieChart({ slices = [], centerLabel = 'Spiele', emptyHint }) {
  const [hover, setHover] = useState(null)
  // Am Handy gibt es kein Überfahren: ein Tippen auf Segment oder Legende wählt aus
  // und bleibt stehen, bis etwas anderes getippt wird.
  const [selected, setSelected] = useState(null)
  const drawn = slices.filter((slice) => Number(slice.value) > 0)
  const total = drawn.reduce((sum, slice) => sum + Number(slice.value), 0)

  if (total === 0) {
    return <div className="chart-empty">{emptyHint ?? 'Noch nichts zum Verteilen.'}</div>
  }

  let offset = 0
  const arcs = drawn.map((slice) => {
    const length = (Number(slice.value) / total) * CIRCUMFERENCE
    const arc = {
      ...slice,
      share: Math.round((Number(slice.value) / total) * 1000) / 10,
      length,
      offset,
    }
    offset += length
    return arc
  })

  const active = arcs.find((arc) => arc.label === (selected ?? hover)) ?? null

  return (
    <figure className="pie">
      <svg
        className="pie-canvas"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Verteilung von ${arcs.map((arc) => arc.label).join(', ')}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerLeave={() => setHover(null)}
      >
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              className="pie-slice"
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={hover === arc.label ? THICKNESS + 7 : THICKNESS}
              strokeDasharray={`${Math.max(arc.length - GAP, 1)} ${CIRCUMFERENCE}`}
              strokeDashoffset={-arc.offset}
              onPointerEnter={() => setHover(arc.label)}
              onClick={() => setSelected(selected === arc.label ? null : arc.label)}
            />
          ))}
        </g>
        <text className="pie-total" x={CENTER} y={CENTER - 1} textAnchor="middle">{total}</text>
        <text className="pie-caption" x={CENTER} y={CENTER + 19} textAnchor="middle">{centerLabel}</text>
      </svg>
      <figcaption className="pie-legend">
        {arcs.map((arc) => (
          <span
            key={arc.label}
            className={`pie-legend-item ${hover === arc.label ? 'hovered' : ''}`}
            title={`${arc.label}: ${arc.value} von ${total} (${arc.share} %)`}
            onPointerEnter={() => setHover(arc.label)}
            onPointerLeave={() => setHover(null)}
            onClick={() => setSelected(selected === arc.label ? null : arc.label)}
          >
            <i style={{ background: arc.color }} />
            {arc.label}
            <strong>{arc.share} %</strong>
            <small>{arc.value}</small>
          </span>
        ))}
      </figcaption>

      {active && (
        <p className="pie-detail">
          <i style={{ background: active.color }} />
          <span>{active.label}</span>
          <strong>{active.share} %</strong>
          <small>{active.value} von {total}</small>
        </p>
      )}
    </figure>
  )
}

export default PieChart
