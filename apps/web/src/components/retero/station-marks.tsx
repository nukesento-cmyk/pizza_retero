/**
 * Custom 2-colour marks for the eight kitchen stations. 48×48, drawn to sit
 * inside enamel signs. Stroke = espresso, fill accents from the palette.
 */
import type { ReactElement } from "react";

const S = { stroke: "#2a1a13", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

export const STATION_MARKS: Record<string, ReactElement> = {
  entrance: (
    <g>
      <path d="M12 42V12a12 12 0 0 1 24 0v30" {...S} fill="#e7a33e" />
      <path d="M18 42V16a6 6 0 0 1 12 0v26" {...S} fill="#15100c" />
      <path d="M6 42h36" {...S} />
      <circle cx="27" cy="30" r="1.5" fill="#e7a33e" />
    </g>
  ),
  dough: (
    <g>
      <ellipse cx="24" cy="30" rx="15" ry="9" {...S} fill="#fbf6ec" />
      <path d="M14 27c4 3 16 3 20 0" {...S} />
      <path d="M8 14l32 8" {...S} strokeWidth={4} stroke="#b5803f" />
      <path d="M8 14l32 8" {...S} />
    </g>
  ),
  sauce: (
    <g>
      <path d="M10 22h28l-3 18H13z" {...S} fill="#c8402b" />
      <path d="M30 22V8" {...S} />
      <path d="M26 8h8" {...S} />
      <path d="M15 28c3-2 6 2 9 0s6 2 9 0" {...S} stroke="#fbf6ec" />
    </g>
  ),
  ingredients: (
    <g>
      <circle cx="16" cy="28" r="8" {...S} fill="#c8402b" />
      <path d="M16 20v-4" {...S} stroke="#2e6b52" />
      <path d="M26 34c0-8 4-14 10-14s10 6 10 14z" {...S} fill="#e9d9bc" transform="translate(-6 0)" />
      <path d="M30 34v6" {...S} />
      <path d="M8 14c4-4 8-4 10 0" {...S} stroke="#2e6b52" />
    </g>
  ),
  assembly: (
    <g>
      <circle cx="24" cy="24" r="17" {...S} fill="#d7a35a" />
      <circle cx="24" cy="24" r="12" fill="#f0b54a" stroke="#c8402b" strokeWidth={2.5} />
      <circle cx="19" cy="20" r="2.5" fill="#a8321f" />
      <circle cx="28" cy="27" r="2.5" fill="#a8321f" />
      <ellipse cx="27" cy="18" rx="3" ry="1.5" fill="#2e6b52" />
    </g>
  ),
  oven: (
    <g>
      <path d="M6 40V26a18 16 0 0 1 36 0v14z" {...S} fill="#9a3020" />
      <path d="M15 40v-9a9 8 0 0 1 18 0v9z" {...S} fill="#f06a2e" />
      <path d="M22 40c-2-4 2-6 1-9 4 3 4 6 3 9" fill="#ffe3a3" />
    </g>
  ),
  reveal: (
    <g>
      <path d="M24 8L40 38H8z" {...S} fill="#f0b54a" />
      <path d="M8 38c5-3 27-3 32 0" {...S} stroke="#d7a35a" strokeWidth={4} />
      <circle cx="22" cy="26" r="2.5" fill="#a8321f" />
      <circle cx="27" cy="32" r="2.5" fill="#a8321f" />
      <path d="M36 8l2-4M42 14l4-2M40 4l1 1" {...S} stroke="#e7a33e" />
    </g>
  ),
  story: (
    <g>
      <path d="M8 12h12a4 4 0 0 1 4 4v24a3 3 0 0 0-3-3H8z" {...S} fill="#fbf6ec" />
      <path d="M40 12H28a4 4 0 0 0-4 4v24a3 3 0 0 1 3-3h13z" {...S} fill="#e9d9bc" />
      <path d="M31 22c1.5-2 4.5-1 4 1.5-.4 2-4 4-4 4s-3.6-2-4-4c-.5-2.5 2.5-3.5 4-1.5z" fill="#c8402b" />
    </g>
  ),
};

export function StationMark({ id, className }: { id: keyof typeof STATION_MARKS; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      {STATION_MARKS[id]}
    </svg>
  );
}
