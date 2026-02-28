import { useEffect, useRef, useState } from 'react';
import { CITIES, DEFAULT_CITY_INDEX } from '../config';

const SVG_SIZE = 800;
const CENTER = SVG_SIZE / 2;
const ORBIT_RADIUS = 250;
const DAY_CIRCLE_RADIUS = 85;
const SUN_RADIUS = 34;
const MOON_RING_RADIUS = 112;
const MOON_ICON_RADIUS = 8;
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

  const angleDeg = 90 + fraction * 360;
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
    const sweepTerminator = k > 0 ? 0 : 1;
    return `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweepTerminator} ${cx} ${cy - r}`;
  } else {
    // Waning: left side lit
    // Left semicircle top→bottom (sweep=0), then terminator bottom→top
    const sweepTerminator = k > 0 ? 1 : 0;
    return `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweepTerminator} ${cx} ${cy - r}`;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function getSkyColor(hour: number, sunrise: number, sunset: number): { bg: string; starOpacity: number } {
  // Key time points
  const preDawn = sunrise - 1.5;   // first hint of light
  const dawn = sunrise - 0.5;      // twilight brightening
  const dayStart = sunrise + 0.75; // full daylight
  const dayEnd = sunset - 0.75;    // start of evening
  const dusk = sunset + 0.5;       // twilight darkening
  const postDusk = sunset + 1.5;   // full night

  const black: [number, number, number] = [0, 0, 0];
  const deepNavy: [number, number, number] = [8, 12, 30];
  const twilight: [number, number, number] = [25, 40, 80];
  const dawn_blue: [number, number, number] = [90, 130, 180];
  const daylight: [number, number, number] = [210, 220, 235];

  let rgb: [number, number, number];
  let starOpacity: number;

  if (hour < preDawn) {
    // Deep night
    rgb = black;
    starOpacity = 1;
  } else if (hour < dawn) {
    // Pre-dawn: black → deep navy
    const t = (hour - preDawn) / (dawn - preDawn);
    rgb = lerpColor(black, deepNavy, t);
    starOpacity = lerp(1, 0.6, t);
  } else if (hour < sunrise) {
    // Dawn twilight: deep navy → twilight blue
    const t = (hour - dawn) / (sunrise - dawn);
    rgb = lerpColor(deepNavy, twilight, t);
    starOpacity = lerp(0.6, 0.2, t);
  } else if (hour < dayStart) {
    // Sunrise → daylight: twilight → dawn blue → daylight
    const t = (hour - sunrise) / (dayStart - sunrise);
    if (t < 0.5) {
      rgb = lerpColor(twilight, dawn_blue, t * 2);
    } else {
      rgb = lerpColor(dawn_blue, daylight, (t - 0.5) * 2);
    }
    starOpacity = lerp(0.2, 0, t);
  } else if (hour < dayEnd) {
    // Full daylight
    rgb = daylight;
    starOpacity = 0;
  } else if (hour < sunset) {
    // Pre-sunset: daylight → dawn blue
    const t = (hour - dayEnd) / (sunset - dayEnd);
    rgb = lerpColor(daylight, dawn_blue, t);
    starOpacity = 0;
  } else if (hour < dusk) {
    // Sunset → dusk: dawn blue → twilight → deep navy
    const t = (hour - sunset) / (dusk - sunset);
    if (t < 0.5) {
      rgb = lerpColor(dawn_blue, twilight, t * 2);
    } else {
      rgb = lerpColor(twilight, deepNavy, (t - 0.5) * 2);
    }
    starOpacity = lerp(0, 0.6, t);
  } else if (hour < postDusk) {
    // Post-dusk: deep navy → black
    const t = (hour - dusk) / (postDusk - dusk);
    rgb = lerpColor(deepNavy, black, t);
    starOpacity = lerp(0.6, 1, t);
  } else {
    // Deep night
    rgb = black;
    starOpacity = 1;
  }

  return {
    bg: `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`,
    starOpacity,
  };
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

const MOBILE_BREAKPOINT = 600;

export default function SunClock() {
  const rafRef = useRef<number>(0);
  const [now, setNow] = useState(() => new Date());
  const [cityIndex, setCityIndex] = useState(DEFAULT_CITY_INDEX);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const city = CITIES[cityIndex];

  useEffect(() => {
    if (!showCityPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowCityPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCityPicker]);

  useEffect(() => {
    function tick() {
      setNow(new Date());
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Orbit position — flip for Southern Hemisphere so local season matches
  const baseOrbitAngle = getOrbitAngle(now);
  const orbitAngle = city.latitude < 0 ? baseOrbitAngle + 180 : baseOrbitAngle;
  const earthPos = polarToCartesian(CENTER, CENTER, ORBIT_RADIUS, orbitAngle);
  const ex = earthPos.x;
  const ey = earthPos.y;

  // Sunrise/sunset for YES Watch dial
  const dayOfYear = getDayOfYear(now);
  const { sunrise, sunset } = getSunTimes(dayOfYear, city.latitude);
  const sunriseAngle = hourToAngle(sunrise);
  const sunsetAngle = hourToAngle(sunset);

  // 24-hour hand angle
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const millis = now.getMilliseconds();
  const decimalHours = hours + minutes / 60 + seconds / 3600 + millis / 3600000;
  const handAngle = hourToAngle(decimalHours);
  const handTip = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 8, handAngle);
  const handTail = polarToCartesian(ex, ey, -18, handAngle);

  // Second hand
  const decimalSeconds = seconds + millis / 1000;
  const secondAngle = (decimalSeconds / 60) * 360 - 90;
  const secondTip = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 10, secondAngle);
  const secondTail = polarToCartesian(ex, ey, -12, secondAngle);

  // Moon phase
  const currentMoonPhase = getMoonPhase(now);

  // Sky color based on time of day
  const sky = getSkyColor(decimalHours, sunrise, sunset);

  useEffect(() => {
    document.body.style.backgroundColor = sky.bg;
  }, [sky.bg]);

  // Season labels — flip names for Southern Hemisphere
  const isSouthern = city.latitude < 0;
  const labelOffset = 24;
  const seasons = [
    { label: isSouthern ? 'Summer' : 'Winter', date: 'Dec 21', x: CENTER, y: CENTER + ORBIT_RADIUS + labelOffset, anchor: 'middle' as const, dy: 22 },
    { label: isSouthern ? 'Winter' : 'Summer', date: 'Jun 21', x: CENTER, y: CENTER - ORBIT_RADIUS - labelOffset + 4, anchor: 'middle' as const, dy: -18 },
    { label: isSouthern ? 'Spring' : 'Autumn', date: 'Sep 22', x: CENTER + ORBIT_RADIUS + labelOffset, y: CENTER + 8, anchor: 'start' as const, dy: 22 },
    { label: isSouthern ? 'Autumn' : 'Spring', date: 'Mar 20', x: CENTER - ORBIT_RADIUS - labelOffset, y: CENTER + 8, anchor: 'end' as const, dy: 22 },
  ];

  // Arc paths for day and night wedges
  const dayPath = describeArc(ex, ey, DAY_CIRCLE_RADIUS, sunriseAngle, sunsetAngle);
  const nightPath = describeArc(ex, ey, DAY_CIRCLE_RADIUS, sunsetAngle, sunriseAngle);

  // Noon/midnight tick marks
  const noonAngle = hourToAngle(12);
  const midnightAngle = hourToAngle(0);
  const noonOuter = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 2, noonAngle);
  const noonInner = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 14, noonAngle);
  const midnightOuter = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 2, midnightAngle);
  const midnightInner = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS - 14, midnightAngle);

  // Shared SVG content pieces
  const dayBlend = 1 - sky.starOpacity;

  const moonRing = Array.from({ length: MOON_COUNT }, (_, i) => {
    const phaseForDay = (currentMoonPhase + i / SYNODIC_PERIOD) % 1;
    const angle = -90 - (i / MOON_COUNT) * 360;
    const pos = polarToCartesian(ex, ey, MOON_RING_RADIUS, angle);
    const isCurrent = i === 0;
    const opacity = isCurrent ? 1 : 0.25;
    const litPath = moonPhasePath(pos.x, pos.y, MOON_ICON_RADIUS, phaseForDay);
    const strokeColor = isCurrent
      ? `rgba(${lerp(255, 120, dayBlend)},${lerp(255, 120, dayBlend)},${lerp(255, 120, dayBlend)},${lerp(0.4, 0.5, dayBlend)})`
      : `rgba(${lerp(255, 120, dayBlend)},${lerp(255, 120, dayBlend)},${lerp(255, 120, dayBlend)},${lerp(0.08, 0.3, dayBlend)})`;
    return (
      <g key={i} opacity={opacity}>
        <circle cx={pos.x} cy={pos.y} r={MOON_ICON_RADIUS} fill="#1a1a2e" stroke={strokeColor} strokeWidth={isCurrent ? 0.6 : lerp(0.3, 0.5, dayBlend)} />
        {litPath === 'full' ? (
          <circle cx={pos.x} cy={pos.y} r={MOON_ICON_RADIUS} fill={isCurrent ? '#e8e0c8' : '#c8c0a8'} />
        ) : litPath ? (
          <path d={litPath} fill={isCurrent ? '#e8e0c8' : '#c8c0a8'} />
        ) : null}
      </g>
    );
  });

  const earthContent = (
    <>
      <defs>
        <clipPath id="earth-clip">
          <circle cx={ex} cy={ey} r={DAY_CIRCLE_RADIUS} />
        </clipPath>
      </defs>
      <circle cx={ex} cy={ey} r={DAY_CIRCLE_RADIUS} fill="#0a0e1a" />
      <path d={dayPath} fill="#2a4a6b" clipPath="url(#earth-clip)" />
      <path d={nightPath} fill="#0d1528" clipPath="url(#earth-clip)" />
      <circle cx={ex} cy={ey} r={DAY_CIRCLE_RADIUS} fill="none" stroke="#4a9eff" strokeWidth={1.5} />
      <line x1={noonOuter.x} y1={noonOuter.y} x2={noonInner.x} y2={noonInner.y} stroke="rgba(255, 255, 255, 0.3)" strokeWidth={1} />
      <line x1={midnightOuter.x} y1={midnightOuter.y} x2={midnightInner.x} y2={midnightInner.y} stroke="rgba(255, 255, 255, 0.15)" strokeWidth={1} />
      <line x1={secondTail.x} y1={secondTail.y} x2={secondTip.x} y2={secondTip.y} stroke="rgba(255, 255, 255, 0.12)" strokeWidth={0.75} strokeLinecap="round" />
      <polygon
        points={`${handTip.x},${handTip.y} ${ex + 4 * Math.cos((handAngle + 90) * Math.PI / 180)},${ey + 4 * Math.sin((handAngle + 90) * Math.PI / 180)} ${handTail.x},${handTail.y} ${ex + 4 * Math.cos((handAngle - 90) * Math.PI / 180)},${ey + 4 * Math.sin((handAngle - 90) * Math.PI / 180)}`}
        fill="rgba(255, 140, 100, 0.85)"
      />
      <circle cx={ex} cy={ey} r={6} fill="#4a9eff" />
      <circle cx={ex} cy={ey} r={3} fill="#0d1528" />
    </>
  );

  const cityPicker = showCityPicker && (
    <div
      ref={pickerRef}
      style={{
        position: 'absolute',
        top: 30,
        left: 16,
        maxHeight: '50%',
        overflowY: 'auto',
        background: 'rgba(10, 14, 26, 0.95)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '4px 0',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
        fontWeight: 300,
        zIndex: 10,
      }}
    >
      {CITIES.map((c, i) => (
        <div
          key={c.name}
          onClick={() => { setCityIndex(i); setShowCityPicker(false); }}
          style={{
            padding: '10px 20px',
            color: i === cityIndex ? '#4a9eff' : 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {c.name}
        </div>
      ))}
    </div>
  );

  const headerBlock = (
    <div style={{ padding: isMobile ? '40px 16px 0' : '24px 16px 0', fontFamily: 'system-ui, sans-serif', textAlign: isMobile ? 'center' : undefined }}>
      <div style={{ display: isMobile ? 'inline-block' : undefined, textAlign: 'left' }}>
        <div
          style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: isMobile ? 24 : 20,
            fontWeight: 100,
            cursor: 'pointer',
          }}
          onClick={() => setShowCityPicker(!showCityPicker)}
        >
          {city.name} &#9662;
        </div>
        <div
          style={{
            color: 'rgba(255,255,255,0.18)',
            fontSize: isMobile ? 42 : 36,
            fontWeight: 100,
            lineHeight: 1.1,
          }}
        >
          {now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
    </div>
  );

  // --- Mobile layout: stacked vertically ---
  if (isMobile) {
    const pad = 10;
    const earthViewSize = (MOON_RING_RADIUS + MOON_ICON_RADIUS + pad) * 2;
    const earthVBx = ex - earthViewSize / 2;
    const earthVBy = ey - earthViewSize / 2;

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        {headerBlock}

        {/* Earth + moons — full width */}
        <svg
          viewBox={`${earthVBx} ${earthVBy} ${earthViewSize} ${earthViewSize}`}
          style={{ width: '100%', height: 'auto' }}
        >
          {moonRing}
          {earthContent}
        </svg>

        {/* Sun view with earth icon on orbit */}
        <svg
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          style={{ width: '100%', height: 'auto' }}
        >
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={`rgba(200, 210, 255, ${s.opacity * sky.starOpacity})`} />
          ))}
          <circle cx={CENTER} cy={CENTER} r={ORBIT_RADIUS} fill="none" stroke="#334" strokeWidth={1.5} />
          {seasons.map((s) => (
            <g key={s.label}>
              <text x={s.x} y={s.y} fill="#667" fontSize={24} fontFamily="system-ui, sans-serif" fontWeight={300} textAnchor={s.anchor}>{s.label}</text>
              <text x={s.x} y={s.y + s.dy} fill="#445" fontSize={16} fontFamily="system-ui, sans-serif" fontWeight={300} textAnchor={s.anchor}>{s.date}</text>
            </g>
          ))}
          <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS} fill="#f5c842" />
          <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS + 8} fill="none" stroke="#f5c84233" strokeWidth={4} />
          {/* Earth icon */}
          <circle cx={ex} cy={ey} r={18} fill="#1a5276" />
          <circle cx={ex} cy={ey} r={18} fill="none" stroke="#4a9eff" strokeWidth={1.5} />
          <ellipse cx={ex} cy={ey} rx={7} ry={16} fill="none" stroke="#2e7d32" strokeWidth={1.5} transform={`rotate(-20 ${ex} ${ey})`} />
          <ellipse cx={ex + 5} cy={ey - 4} rx={8} ry={5} fill="#2e7d32" opacity={0.6} />
          <ellipse cx={ex - 6} cy={ey + 6} rx={6} ry={4} fill="#2e7d32" opacity={0.5} />
        </svg>

        {cityPicker}
      </div>
    );
  }

  // --- Desktop layout: single SVG ---
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: SVG_SIZE }}>
    {headerBlock}
    <svg
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      style={{ width: '100%', height: 'auto' }}
    >
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={`rgba(200, 210, 255, ${s.opacity * sky.starOpacity})`} />
      ))}
      <circle cx={CENTER} cy={CENTER} r={ORBIT_RADIUS} fill="none" stroke="#334" strokeWidth={1.5} />
      {seasons.map((s) => (
        <g key={s.label}>
          <text x={s.x} y={s.y} fill="#667" fontSize={24} fontFamily="system-ui, sans-serif" fontWeight={300} textAnchor={s.anchor}>{s.label}</text>
          <text x={s.x} y={s.y + s.dy} fill="#445" fontSize={16} fontFamily="system-ui, sans-serif" fontWeight={300} textAnchor={s.anchor}>{s.date}</text>
        </g>
      ))}
      <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS} fill="#f5c842" />
      <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS + 8} fill="none" stroke="#f5c84233" strokeWidth={4} />
      {moonRing}
      {earthContent}
    </svg>
    {cityPicker}
    </div>
  );
}
