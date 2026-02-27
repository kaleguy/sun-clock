import { useEffect, useRef, useState } from 'react';
import { LATITUDE } from '../config';

const SVG_SIZE = 800;
const CENTER = SVG_SIZE / 2;
const ORBIT_RADIUS = 280;
const DAY_CIRCLE_RADIUS = 70;
const SUN_RADIUS = 30;
const MOON_RING_RADIUS = 95;
const MOON_ICON_RADIUS = 5;
const MOON_COUNT = 30;
const SYNODIC_PERIOD = 29.53058770576;

// Winter solstice is ~Dec 21 = day 355 of the year
const WINTER_SOLSTICE_DAY = 355;

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getDaysInYear(date: Date): number {
  return new Date(date.getFullYear(), 1, 29).getDate() === 29 ? 366 : 365;
}

function getOrbitAngle(date: Date): number {
  const dayOfYear = getDayOfYear(date);
  const daysInYear = getDaysInYear(date);

  const daysSinceSolstice = (dayOfYear - WINTER_SOLSTICE_DAY + daysInYear) % daysInYear;
  const fraction = daysSinceSolstice / daysInYear;

  const angleDeg = 90 - fraction * 360;
  return angleDeg;
}

function getSunTimes(dayOfYear: number, latitude: number): { sunrise: number; sunset: number } {
  const declination = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81)) * Math.PI / 180);
  const latRad = latitude * Math.PI / 180;
  const declRad = declination * Math.PI / 180;
  const cosOmega = -Math.tan(latRad) * Math.tan(declRad);

  if (cosOmega < -1) return { sunrise: 0, sunset: 24 };
  if (cosOmega > 1) return { sunrise: 12, sunset: 12 };

  const omega = Math.acos(cosOmega) * 180 / Math.PI;
  return { sunrise: 12 - omega / 15, sunset: 12 + omega / 15 };
}

function hourToAngle(hour: number): number {
  return ((hour - 6) / 24) * 360;
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);

  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;

  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

/**
 * Get the current moon phase as a fraction 0–1.
 * 0 = new moon, 0.5 = full moon.
 */
function getMoonPhase(date: Date): number {
  // Reference new moon: January 6, 2000 18:14 UTC
  const refNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const daysSinceRef = (date.getTime() - refNewMoon) / (1000 * 60 * 60 * 24);
  const phase = ((daysSinceRef % SYNODIC_PERIOD) + SYNODIC_PERIOD) % SYNODIC_PERIOD;
  return phase / SYNODIC_PERIOD;
}

/**
 * Return an SVG path for the illuminated portion of a moon.
 * phase: 0 = new moon, 0.5 = full moon, 1 = new moon again.
 */
function moonPhasePath(cx: number, cy: number, r: number, phase: number): string {
  phase = ((phase % 1) + 1) % 1;

  // Near new moon — nothing to draw
  if (phase < 0.01 || phase > 0.99) return '';

  // Near full moon — signal to caller to draw a filled circle instead
  if (Math.abs(phase - 0.5) < 0.01) return 'full';

  const k = Math.cos(phase * 2 * Math.PI);
  const rx = Math.abs(k) * r;

  if (phase < 0.5) {
    // Waxing: right side lit
    // Right semicircle top→bottom (sweep=1), then terminator bottom→top
    const sweepTerminator = k > 0 ? 1 : 0;
    return `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweepTerminator} ${cx} ${cy - r}`;
  } else {
    // Waning: left side lit
    // Left semicircle top→bottom (sweep=0), then terminator bottom→top
    const sweepTerminator = k > 0 ? 0 : 1;
    return `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweepTerminator} ${cx} ${cy - r}`;
  }
}

// Simple seeded random for stable star positions
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateStars(count: number, size: number) {
  const rng = mulberry32(42);
  const stars: { x: number; y: number; r: number; opacity: number }[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng() * size,
      y: rng() * size,
      r: rng() * 1.2 + 0.3,
      opacity: rng() * 0.5 + 0.1,
    });
  }
  return stars;
}

const STARS = generateStars(120, SVG_SIZE);

export default function SunClock() {
  const rafRef = useRef<number>(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    function tick() {
      setNow(new Date());
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Orbit position
  const orbitAngle = getOrbitAngle(now);
  const earthPos = polarToCartesian(CENTER, CENTER, ORBIT_RADIUS, orbitAngle);
  const ex = earthPos.x;
  const ey = earthPos.y;

  // Sunrise/sunset for YES Watch dial
  const dayOfYear = getDayOfYear(now);
  const { sunrise, sunset } = getSunTimes(dayOfYear, LATITUDE);
  const sunriseAngle = hourToAngle(sunrise);
  const sunsetAngle = hourToAngle(sunset);

  // 24-hour hand angle
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const millis = now.getMilliseconds();
  const decimalHours = hours + minutes / 60 + seconds / 3600 + millis / 3600000;
  const handAngle = hourToAngle(decimalHours);
  const handTip = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 6, handAngle);
  const handTail = polarToCartesian(ex, ey, -14, handAngle);

  // Second hand
  const decimalSeconds = seconds + millis / 1000;
  const secondAngle = (decimalSeconds / 60) * 360 - 90;
  const secondTip = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 8, secondAngle);
  const secondTail = polarToCartesian(ex, ey, -10, secondAngle);

  // Moon phase
  const currentMoonPhase = getMoonPhase(now);

  // Season labels
  const labelOffset = 32;
  const seasons = [
    { label: 'Winter', date: 'Dec 21', x: CENTER, y: CENTER + ORBIT_RADIUS + labelOffset, anchor: 'middle' as const, dy: 16 },
    { label: 'Summer', date: 'Jun 21', x: CENTER, y: CENTER - ORBIT_RADIUS - labelOffset + 10, anchor: 'middle' as const, dy: -12 },
    { label: 'Spring', date: 'Mar 20', x: CENTER + ORBIT_RADIUS + labelOffset, y: CENTER + 5, anchor: 'start' as const, dy: 16 },
    { label: 'Autumn', date: 'Sep 22', x: CENTER - ORBIT_RADIUS - labelOffset, y: CENTER + 5, anchor: 'end' as const, dy: 16 },
  ];

  // Arc paths for day and night wedges
  const dayPath = describeArc(ex, ey, DAY_CIRCLE_RADIUS, sunriseAngle, sunsetAngle);
  const nightPath = describeArc(ex, ey, DAY_CIRCLE_RADIUS, sunsetAngle, sunriseAngle);

  // Noon/midnight tick marks
  const noonAngle = hourToAngle(12);
  const midnightAngle = hourToAngle(0);
  const noonOuter = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 2, noonAngle);
  const noonInner = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 10, noonAngle);
  const midnightOuter = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 2, midnightAngle);
  const midnightInner = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 10, midnightAngle);

  return (
    <svg
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      style={{ width: '100%', maxWidth: SVG_SIZE, height: 'auto' }}
    >
      {/* Stars */}
      {STARS.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill={`rgba(200, 210, 255, ${s.opacity})`}
        />
      ))}

      {/* Orbit circle */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={ORBIT_RADIUS}
        fill="none"
        stroke="#334"
        strokeWidth={1.5}
      />

      {/* Season labels */}
      {seasons.map((s) => (
        <g key={s.label}>
          <text
            x={s.x}
            y={s.y}
            fill="#667"
            fontSize={14}
            fontFamily="system-ui, sans-serif"
            textAnchor={s.anchor}
          >
            {s.label}
          </text>
          <text
            x={s.x}
            y={s.y + s.dy}
            fill="#445"
            fontSize={11}
            fontFamily="system-ui, sans-serif"
            textAnchor={s.anchor}
          >
            {s.date}
          </text>
        </g>
      ))}

      {/* Sun */}
      <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS} fill="#f5c842" />
      <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS + 8} fill="none" stroke="#f5c84233" strokeWidth={4} />

      {/* Moon ring — 30 phases around Earth */}
      {Array.from({ length: MOON_COUNT }, (_, i) => {
        // Phase for this position: current + i days
        const phaseForDay = (currentMoonPhase + i / SYNODIC_PERIOD) % 1;

        // Position: index 0 at top (-90°), counter-clockwise (matching lunar orbit)
        const angle = -90 - (i / MOON_COUNT) * 360;
        const pos = polarToCartesian(ex, ey, MOON_RING_RADIUS, angle);

        // Current moon (i=0) is bright, others dim
        const isCurrent = i === 0;
        const opacity = isCurrent ? 1 : 0.25;

        const litPath = moonPhasePath(pos.x, pos.y, MOON_ICON_RADIUS, phaseForDay);

        return (
          <g key={i} opacity={opacity}>
            {/* Dark base circle */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={MOON_ICON_RADIUS}
              fill="#1a1a2e"
              stroke={isCurrent ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.08)'}
              strokeWidth={isCurrent ? 0.6 : 0.3}
            />
            {/* Lit portion */}
            {litPath === 'full' ? (
              <circle cx={pos.x} cy={pos.y} r={MOON_ICON_RADIUS} fill={isCurrent ? '#e8e0c8' : '#c8c0a8'} />
            ) : litPath ? (
              <path d={litPath} fill={isCurrent ? '#e8e0c8' : '#c8c0a8'} />
            ) : null}
          </g>
        );
      })}

      {/* Earth day circle — YES Watch style */}
      <defs>
        <clipPath id="earth-clip">
          <circle cx={ex} cy={ey} r={DAY_CIRCLE_RADIUS} />
        </clipPath>
      </defs>

      {/* Night background (full circle) */}
      <circle cx={ex} cy={ey} r={DAY_CIRCLE_RADIUS} fill="#0a0e1a" />

      {/* Day wedge */}
      <path d={dayPath} fill="#2a4a6b" clipPath="url(#earth-clip)" />

      {/* Night wedge */}
      <path d={nightPath} fill="#0d1528" clipPath="url(#earth-clip)" />

      {/* Circle border */}
      <circle cx={ex} cy={ey} r={DAY_CIRCLE_RADIUS} fill="none" stroke="#4a9eff" strokeWidth={1.5} />

      {/* Noon tick */}
      <line
        x1={noonOuter.x} y1={noonOuter.y}
        x2={noonInner.x} y2={noonInner.y}
        stroke="rgba(255, 255, 255, 0.3)"
        strokeWidth={1}
      />

      {/* Midnight tick */}
      <line
        x1={midnightOuter.x} y1={midnightOuter.y}
        x2={midnightInner.x} y2={midnightInner.y}
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1}
      />

      {/* Second hand */}
      <line
        x1={secondTail.x} y1={secondTail.y}
        x2={secondTip.x} y2={secondTip.y}
        stroke="rgba(255, 255, 255, 0.12)"
        strokeWidth={0.75}
        strokeLinecap="round"
      />

      {/* 24-hour hand — tapered shape */}
      <polygon
        points={`
          ${handTip.x},${handTip.y}
          ${ex + 3 * Math.cos((handAngle + 90) * Math.PI / 180)},${ey + 3 * Math.sin((handAngle + 90) * Math.PI / 180)}
          ${handTail.x},${handTail.y}
          ${ex + 3 * Math.cos((handAngle - 90) * Math.PI / 180)},${ey + 3 * Math.sin((handAngle - 90) * Math.PI / 180)}
        `}
        fill="rgba(255, 140, 100, 0.85)"
      />

      {/* Center dot */}
      <circle cx={ex} cy={ey} r={5} fill="#4a9eff" />
      <circle cx={ex} cy={ey} r={2.5} fill="#0d1528" />
    </svg>
  );
}
