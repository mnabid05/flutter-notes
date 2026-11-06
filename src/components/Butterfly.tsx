import { useId } from 'react';
export function Butterfly({
  state = 'resting',
  small = false,
}: {
  state?: string;
  small?: boolean;
}) {
  const id = useId();
  return (
    <svg
      className={`butterfly ${small ? 'small' : ''} ${state}`}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id}>
          <stop stopColor="var(--wing-core)" />
          <stop offset="1" stopColor="var(--wing-edge)" stopOpacity=".35" />
        </radialGradient>
      </defs>
      <g className="wing-left" fill={`url(#${id})`} stroke="var(--wing-line)" strokeWidth=".7">
        <path d="M49 53C34 48 12 38 14 21C16 7 36 21 43 34Z" />
        <path d="M49 53C29 47 20 59 25 72C31 86 44 69 49 53Z" />
        <path d="M47 49L22 23M45 56L30 71" />
      </g>
      <g className="wing-right" fill={`url(#${id})`} stroke="var(--wing-line)" strokeWidth=".7">
        <path d="M51 53C66 48 88 38 86 21C84 7 64 21 57 34Z" />
        <path d="M51 53C71 47 80 59 75 72C69 86 56 69 51 53Z" />
        <path d="M53 49L78 23M55 56L70 71" />
      </g>
      <path
        d="M50 40V65M49 43Q43 27 38 27M51 43Q57 27 62 27"
        stroke="var(--wing-core)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
