// UI icons come from lucide-react; this file only holds the EU stars mark.

/** Ring of 12 stars, echoing the EU flag. */
export const StarsMark = ({ size = 56 }: { size?: number }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
    {Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2
      const x = 50 + 36 * Math.cos(a)
      const y = 50 + 36 * Math.sin(a)
      return (
        <polygon
          key={i}
          fill="var(--ecl-color-secondary)"
          transform={`translate(${x} ${y})`}
          points="0,-7 1.6,-2.2 6.7,-2.2 2.6,0.8 4.1,5.7 0,2.8 -4.1,5.7 -2.6,0.8 -6.7,-2.2 -1.6,-2.2"
        />
      )
    })}
  </svg>
)
