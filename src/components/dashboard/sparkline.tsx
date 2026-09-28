import { sparklinePoints } from "@/lib/dashboard";

const WIDTH = 120;
const HEIGHT = 32;

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`Histórico de precio normal (${values.length} chequeos)`}
      className="text-zinc-400"
    >
      <polyline
        points={sparklinePoints(values, WIDTH, HEIGHT, 2)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
