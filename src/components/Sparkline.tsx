import React from 'react';

/**
 * Mini-gráfico de tendência (sparkline). Substitui o amontoado de números
 * mensais por uma leitura de relance. Decorativo (aria-hidden) — o número-herói
 * e as sub-métricas já dão o dado exato.
 */
export const Sparkline: React.FC<{
  values: number[];
  color?: string;
  className?: string;
}> = ({ values, color = 'currentColor', className }) => {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const W = 100;
  const H = 28;
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const;
  });
  const points = coords.map(([x, y]) => `${x},${y}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lx} cy={ly} r={2.5} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
