export function HUDGauge({
  value,
  label,
  size = 96,
}: {
  /** 0-100 */
  value: number;
  label: string;
  size?: number;
}) {
  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={2}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#CCFF00"
          strokeWidth={2}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(204,255,0,0.6))" }}
        />
        <circle cx={size / 2} cy={6} r={3} fill="#CCFF00" />
      </svg>
      <div>
        <p className="font-mono text-3xl font-medium tracking-tight text-white">{value}%</p>
        <p className="font-mono text-xs uppercase tracking-widest text-white/45">{label}</p>
      </div>
    </div>
  );
}
