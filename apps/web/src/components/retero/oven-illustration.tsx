/**
 * Hand-built SVG of the parlour's wood-fired oven: brick dome, copper flue,
 * enamel plaque, live fire and a pie on the peel. Used in the hero and as the
 * 2D fallback for the Phase 6 oven station when WebGL is unavailable.
 * Decorative: hidden from assistive tech.
 */
export function OvenIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 400" className={className} aria-hidden="true" role="presentation">
      <defs>
        <pattern id="bricks" width="36" height="18" patternUnits="userSpaceOnUse">
          <rect width="36" height="18" fill="#9a3020" />
          <path d="M0 0.5H36M0 9.5H36M0.5 0V9M18.5 9V18" stroke="#6e2016" strokeWidth="1.4" />
        </pattern>
        <pattern id="tiles" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="#f6ecd9" />
          <rect width="10" height="10" fill="#2a1a13" />
          <rect x="10" y="10" width="10" height="10" fill="#2a1a13" />
        </pattern>
        <radialGradient id="fire" cx="50%" cy="85%" r="75%">
          <stop offset="0%" stopColor="#ffd27a" />
          <stop offset="30%" stopColor="#f06a2e" />
          <stop offset="65%" stopColor="#8f2a1c" />
          <stop offset="100%" stopColor="#15100c" />
        </radialGradient>
        <radialGradient id="halo" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor="#f06a2e" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f06a2e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="copper" x1="0" x2="1">
          <stop offset="0%" stopColor="#7a3b1c" />
          <stop offset="45%" stopColor="#d98a4a" />
          <stop offset="100%" stopColor="#7a3b1c" />
        </linearGradient>
        <radialGradient id="cheese" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffe3a3" />
          <stop offset="100%" stopColor="#f0b54a" />
        </radialGradient>
      </defs>

      {/* warm light spilling into the room */}
      <ellipse cx="210" cy="250" rx="210" ry="150" fill="url(#halo)" className="motion-safe:animate-glow origin-center" />

      {/* copper flue */}
      <rect x="186" y="6" width="48" height="74" rx="4" fill="url(#copper)" stroke="#2a1a13" strokeWidth="3" />
      <rect x="178" y="0" width="64" height="14" rx="3" fill="#b5652f" stroke="#2a1a13" strokeWidth="3" />

      {/* brick dome */}
      <path d="M40 318 V220 A170 160 0 0 1 380 220 V318 Z" fill="url(#bricks)" stroke="#2a1a13" strokeWidth="4" />
      {/* soot shading */}
      <path d="M40 318 V220 A170 160 0 0 1 380 220 V318 Z" fill="#15100c" opacity="0.12" />

      {/* enamel plaque */}
      <g transform="translate(150 96)">
        <rect width="120" height="38" rx="12" fill="#fbf6ec" stroke="#2a1a13" strokeWidth="3" />
        <rect x="5" y="5" width="110" height="28" rx="8" fill="none" stroke="#c8402b" strokeWidth="2" />
        <text x="60" y="27" textAnchor="middle" fontFamily="var(--font-shrikhand), serif" fontSize="20" fill="#c8402b">Forno</text>
      </g>

      {/* oven mouth */}
      <path d="M128 318 V246 A82 76 0 0 1 292 246 V318 Z" fill="url(#fire)" stroke="#2a1a13" strokeWidth="4" />
      {/* arch voussoirs */}
      <path d="M116 318 V246 A94 88 0 0 1 304 246 V318" fill="none" stroke="#e7a33e" strokeWidth="6" strokeDasharray="14 6" />

      {/* fire */}
      <g className="motion-safe:animate-flicker">
        <path d="M168 318 C160 296 178 286 176 266 C192 282 196 296 190 318 Z" fill="#f06a2e" />
        <path d="M196 318 C186 288 210 274 206 246 C230 270 232 296 222 318 Z" fill="#e7a33e" />
        <path d="M228 318 C224 300 238 292 238 276 C252 292 254 306 248 318 Z" fill="#f06a2e" />
        <path d="M204 318 C200 302 212 296 212 284 C222 298 222 308 218 318 Z" fill="#ffe3a3" />
      </g>

      {/* tiled hearth band */}
      <rect x="22" y="318" width="376" height="40" fill="url(#tiles)" stroke="#2a1a13" strokeWidth="4" />
      <rect x="10" y="356" width="400" height="16" rx="3" fill="#e9d9bc" stroke="#2a1a13" strokeWidth="4" />

      {/* peel + pizza */}
      <g transform="translate(250 300) rotate(-8)">
        <rect x="70" y="38" width="120" height="12" rx="6" fill="#b5803f" stroke="#2a1a13" strokeWidth="3" />
        <circle cx="40" cy="44" r="54" fill="#d7a35a" stroke="#2a1a13" strokeWidth="3" />
        <circle cx="40" cy="44" r="44" fill="#c8402b" />
        <circle cx="40" cy="44" r="40" fill="url(#cheese)" />
        {[[22, 30], [56, 34], [34, 62], [60, 58], [40, 44]].map(([x, y]) => (
          <circle key={`p${x}-${y}`} cx={x} cy={y} r="7" fill="#a8321f" stroke="#7d2416" strokeWidth="1.5" />
        ))}
        {[[30, 46, 20], [50, 24, -30], [52, 70, 40]].map(([x, y, r]) => (
          <ellipse key={`b${x}-${y}`} cx={x} cy={y} rx="7" ry="3.5" fill="#2e6b52" transform={`rotate(${r} ${x} ${y})`} />
        ))}
      </g>
    </svg>
  );
}
