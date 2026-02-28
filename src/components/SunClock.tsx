import { useEffect, useRef, useState } from 'react';
import { CITIES, DEFAULT_CITY_INDEX } from '../config';
import { Browser } from '@capacitor/browser';

const SVG_SIZE = 800;
const CENTER = SVG_SIZE / 2;
const ORBIT_RADIUS = 210;
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

/**
 * Approximate moonrise/moonset times and azimuth directions.
 * Uses the moon's ecliptic longitude to estimate declination,
 * then computes rise/set like the sun but with a parallax-adjusted altitude.
 */
function getMoonTimes(date: Date, latitude: number, longitude: number): {
  moonrise: number | null;
  moonset: number | null;
  moonriseDir: string;
  moonsetDir: string;
} {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;

  // Julian date
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;

  // Moon's mean elements
  const L0 = (218.316 + 481267.8813 * T) % 360;
  const M = (134.963 + 477198.8676 * T) % 360;
  const F = (93.272 + 483202.0175 * T) % 360;

  // Ecliptic longitude
  const lambda = L0 + 6.289 * Math.sin(M * toRad);
  // Ecliptic latitude
  const beta = 5.128 * Math.sin(F * toRad);
  // Obliquity
  const epsilon = 23.439 - 0.00000036 * (jd - 2451545.0);

  // Declination
  const sinDec = Math.sin(beta * toRad) * Math.cos(epsilon * toRad) +
    Math.cos(beta * toRad) * Math.sin(epsilon * toRad) * Math.sin(lambda * toRad);
  const dec = Math.asin(sinDec);

  // Right ascension
  const y = Math.sin(lambda * toRad) * Math.cos(epsilon * toRad) - Math.tan(beta * toRad) * Math.sin(epsilon * toRad);
  const x = Math.cos(lambda * toRad);
  const ra = Math.atan2(y, x);

  const latRad = latitude * toRad;

  // Moon's apparent altitude at rise/set (accounting for parallax and refraction)
  const h0 = 0.125 * toRad; // ~7.2 arcmin above horizon

  const cosH = (Math.sin(h0) - Math.sin(latRad) * Math.sin(dec)) /
    (Math.cos(latRad) * Math.cos(dec));

  if (cosH < -1) {
    // Moon never sets (circumpolar)
    return { moonrise: 0, moonset: null, moonriseDir: '', moonsetDir: '' };
  }
  if (cosH > 1) {
    // Moon never rises
    return { moonrise: null, moonset: null, moonriseDir: '', moonsetDir: '' };
  }

  const H = Math.acos(cosH);

  // Sidereal time at Greenwich midnight
  const gmst0 = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360;

  // Transit time
  const transit = ((ra * toDeg - gmst0 - longitude + 720) % 360) / 360 * 24;

  let rise = transit - (H * toDeg / 15);
  let set = transit + (H * toDeg / 15);

  // Normalize to 0-24
  rise = ((rise % 24) + 24) % 24;
  set = ((set % 24) + 24) % 24;

  // Azimuth at rise/set
  const cosAz = Math.sin(dec) / Math.cos(latRad);
  const azRise = Math.acos(cosAz) * toDeg;
  const azSet = 360 - azRise;

  function azToDir(az: number): string {
    if (az < 22.5 || az >= 337.5) return 'N';
    if (az < 67.5) return 'NE';
    if (az < 112.5) return 'E';
    if (az < 157.5) return 'SE';
    if (az < 202.5) return 'S';
    if (az < 247.5) return 'SW';
    if (az < 292.5) return 'W';
    return 'NW';
  }

  return {
    moonrise: rise,
    moonset: set,
    moonriseDir: azToDir(azRise),
    moonsetDir: azToDir(azSet),
  };
}

function formatTime(h: number | null): string {
  if (h === null) return '--:--';
  const hrs = Math.floor(h);
  const mins = Math.floor((h - hrs) * 60);
  const ampm = hrs >= 12 ? 'pm' : 'am';
  const h12 = hrs % 12 || 12;
  return `${h12}:${mins.toString().padStart(2, '0')} ${ampm}`;
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

function getSkyColor(hour: number, sunrise: number, sunset: number, daylightColor: [number, number, number] = [240, 242, 245]): { bg: string; starOpacity: number } {
  // Key time points
  const preDawn = sunrise - 1.5;   // first hint of light
  const dawn = sunrise - 0.5;      // twilight brightening
  const dayStart = sunrise + 0.75; // initial daylight
  const dayFull = sunrise + 2.75;  // full white
  const dayEndFull = sunset - 2.75; // start fading from white
  const dayEnd = sunset - 0.75;    // start of evening
  const dusk = sunset + 0.5;       // twilight darkening
  const postDusk = sunset + 1.5;   // full night

  const black: [number, number, number] = [0, 0, 0];
  const deepNavy: [number, number, number] = [8, 12, 30];
  const twilight: [number, number, number] = [25, 40, 80];
  const dawn_blue: [number, number, number] = [90, 130, 180];
  const daylight = daylightColor;

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
  } else if (hour < dayFull) {
    // Early day: daylight blue → white
    const t = (hour - dayStart) / (dayFull - dayStart);
    rgb = lerpColor(daylight, [255, 255, 255], t);
    starOpacity = 0;
  } else if (hour < dayEndFull) {
    // Full white daylight
    rgb = [255, 255, 255];
    starOpacity = 0;
  } else if (hour < dayEnd) {
    // Late day: white → daylight blue
    const t = (hour - dayEndFull) / (dayEnd - dayEndFull);
    rgb = lerpColor([255, 255, 255], daylight, t);
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
  const stars: { x: number; y: number; r: number; opacity: number; glow: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rng();
    const isBright = roll < 0.08;
    const isMedium = roll >= 0.08 && roll < 0.25;
    stars.push({
      x: rng() * size,
      y: rng() * size,
      r: isBright ? rng() * 1.5 + 1.5 : isMedium ? rng() * 0.8 + 0.8 : rng() * 0.6 + 0.2,
      opacity: isBright ? rng() * 0.3 + 0.7 : isMedium ? rng() * 0.3 + 0.3 : rng() * 0.3 + 0.05,
      glow: isBright,
    });
  }
  return stars;
}

const STARS = generateStars(200, SVG_SIZE);

// Weather icon SVG paths (based on Lucide icons, 24x24 viewBox)
function WeatherSvgIcon({ type, x, y, size = 20 }: { type: string; x: number; y: number; size?: number }) {
  const s = size / 24; // scale factor
  const col = 'rgba(0,0,0,0.55)';
  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${s})`} fill="none" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {type === 'sunny' && (
        <>
          <circle cx={12} cy={12} r={4} />
          <line x1={12} y1={2} x2={12} y2={4} />
          <line x1={12} y1={20} x2={12} y2={22} />
          <line x1={4.93} y1={4.93} x2={6.34} y2={6.34} />
          <line x1={17.66} y1={17.66} x2={19.07} y2={19.07} />
          <line x1={2} y1={12} x2={4} y2={12} />
          <line x1={20} y1={12} x2={22} y2={12} />
          <line x1={4.93} y1={19.07} x2={6.34} y2={17.66} />
          <line x1={17.66} y1={6.34} x2={19.07} y2={4.93} />
        </>
      )}
      {type === 'partlyCloudy' && (
        <>
          <path d="M12 2v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M20 12h2" />
          <path d="M19.07 4.93l-1.41 1.41" />
          <path d="M15.95 5.63a5 5 0 0 0-7.9 4.24" />
          <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z" />
        </>
      )}
      {type === 'cloudy' && (
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
      )}
      {type === 'rain' && (
        <>
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="M16 14v6" />
          <path d="M8 14v6" />
          <path d="M12 16v6" />
        </>
      )}
      {type === 'snow' && (
        <>
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="M8 15h.01" />
          <path d="M8 19h.01" />
          <path d="M12 17h.01" />
          <path d="M12 21h.01" />
          <path d="M16 15h.01" />
          <path d="M16 19h.01" />
        </>
      )}
      {type === 'storm' && (
        <>
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="M13 12l-3 5h4l-3 5" />
        </>
      )}
      {type === 'fog' && (
        <>
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="M16 17H7" />
          <path d="M17 21H9" />
        </>
      )}
    </g>
  );
}

const MOBILE_BREAKPOINT = 600;

export default function SunClock() {
  const rafRef = useRef<number>(0);
  const [now, setNow] = useState(() => new Date());
  const [cityIndex, setCityIndex] = useState(DEFAULT_CITY_INDEX);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches);
  const [isSmallMobile, setIsSmallMobile] = useState(() => window.innerHeight < 750);
  const [showAbout, setShowAbout] = useState(false);
  const [bgMode, setBgMode] = useState<'darkBlue' | 'black' | 'daylight'>(() => {
    const saved = localStorage.getItem('sunClock_bgMode');
    if (saved === 'black' || saved === 'daylight') return saved;
    // Migrate old setting
    if (localStorage.getItem('sunClock_dynamicSky') === 'true') return 'daylight';
    return 'darkBlue';
  });
  const [showWeather, setShowWeather] = useState(() => localStorage.getItem('sunClock_showWeather') === 'true');
  const [weatherIcon, setWeatherIcon] = useState<string | null>(null);
  const [weatherForecast, setWeatherForecast] = useState<string | null>(null);
  const [showWeatherModal, setShowWeatherModal] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = () => {
      setIsMobile(mq.matches);
      setIsSmallMobile(window.innerHeight < 750);
    };
    mq.addEventListener('change', handler);
    window.addEventListener('resize', handler);
    return () => {
      mq.removeEventListener('change', handler);
      window.removeEventListener('resize', handler);
    };
  }, []);

  const city = CITIES[cityIndex];


  useEffect(() => {
    function tick() {
      setNow(new Date());
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Fetch weather from NOAA (US locations only)
  useEffect(() => {
    setWeatherIcon(null);
    setWeatherForecast(null);
    if (!showWeather) return;
    let cancelled = false;

    async function fetchWeather() {
      try {
        const ptRes = await fetch(
          `https://api.weather.gov/points/${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`,
          { headers: { 'User-Agent': 'SunClock/1.0' } }
        );
        if (!ptRes.ok) return; // Not a US location
        const ptData = await ptRes.json();
        const forecastUrl = ptData.properties?.forecast;
        if (!forecastUrl) return;

        const fcRes = await fetch(forecastUrl, { headers: { 'User-Agent': 'SunClock/1.0' } });
        if (!fcRes.ok) return;
        const fcData = await fcRes.json();
        const periods = fcData.properties?.periods;
        if (!periods?.length || cancelled) return;

        const today = periods[0];
        const short: string = today.shortForecast.toLowerCase();
        let icon = '';
        if (short.includes('thunder') || short.includes('storm')) icon = 'storm';
        else if (short.includes('rain') || short.includes('shower') || short.includes('drizzle')) icon = 'rain';
        else if (short.includes('snow') || short.includes('blizzard') || short.includes('flurr')) icon = 'snow';
        else if (short.includes('fog') || short.includes('mist') || short.includes('haze')) icon = 'fog';
        else if (short.includes('partly') || short.includes('mostly sunny')) icon = 'partlyCloudy';
        else if (short.includes('cloud') || short.includes('overcast') || short.includes('mostly cloudy')) icon = 'cloudy';
        else if (short.includes('sunny') || short.includes('clear')) icon = 'sunny';
        else icon = 'cloudy';

        if (!cancelled) {
          setWeatherIcon(icon);
          // Build full forecast text from first few periods
          const report = periods.slice(0, 6).map((p: { name: string; temperature: number; temperatureUnit: string; shortForecast: string; windSpeed: string; windDirection: string }) =>
            `${p.name}: ${p.temperature}°${p.temperatureUnit} — ${p.shortForecast}. Wind ${p.windSpeed} ${p.windDirection}`
          ).join('\n\n');
          setWeatherForecast(report);
        }
      } catch {
        // Silently fail for non-US locations or network issues
      }
    }

    fetchWeather();
    return () => { cancelled = true; };
  }, [city.latitude, city.longitude, showWeather]);

  // Orbit position — flip for Southern Hemisphere so local season matches
  const baseOrbitAngle = getOrbitAngle(now);
  const orbitAngle = city.latitude < 0 ? baseOrbitAngle + 180 : baseOrbitAngle;
  const earthPos = polarToCartesian(CENTER, CENTER, ORBIT_RADIUS, orbitAngle);
  const ex = earthPos.x;
  const ey = earthPos.y;

  // Sunrise/sunset for YES Watch dial
  const dayOfYear = getDayOfYear(now);
  const { sunrise, sunset } = getSunTimes(dayOfYear, city.latitude);
  const { moonrise, moonset, moonriseDir, moonsetDir } = getMoonTimes(now, city.latitude, city.longitude);
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
  const sky = bgMode === 'daylight'
    ? getSkyColor(decimalHours, sunrise, sunset)
    : bgMode === 'black'
      ? { bg: 'rgb(0,0,0)', starOpacity: 1 }
      : { bg: 'rgb(22,22,52)', starOpacity: 1 };

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
        <filter id="day-blur">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <circle cx={ex} cy={ey} r={DAY_CIRCLE_RADIUS} fill="#0a0e1a" />
      <path d={dayPath} fill="#e8c84a" clipPath="url(#earth-clip)" filter="url(#day-blur)" />
      <path d={nightPath} fill="#0d1528" clipPath="url(#earth-clip)" />
      <circle cx={ex} cy={ey} r={DAY_CIRCLE_RADIUS} fill="none" stroke="#4a9eff" strokeWidth={1.5} />
      {weatherIcon && (() => {
        const noonAngle = hourToAngle(12);
        const iconPos = polarToCartesian(ex, ey, DAY_CIRCLE_RADIUS * 0.5, noonAngle);
        return (
          <g style={{ cursor: 'pointer' }} onClick={() => setShowWeatherModal(true)}>
            <circle cx={iconPos.x} cy={iconPos.y} r={16} fill="transparent" />
            <WeatherSvgIcon type={weatherIcon} x={iconPos.x} y={iconPos.y} size={24} />
          </g>
        );
      })()}
      <line x1={secondTail.x} y1={secondTail.y} x2={secondTip.x} y2={secondTip.y} stroke="rgba(255, 255, 255, 0.12)" strokeWidth={0.75} strokeLinecap="round" />
      <polygon
        points={`${handTip.x},${handTip.y} ${ex + 4 * Math.cos((handAngle + 90) * Math.PI / 180)},${ey + 4 * Math.sin((handAngle + 90) * Math.PI / 180)} ${handTail.x},${handTail.y} ${ex + 4 * Math.cos((handAngle - 90) * Math.PI / 180)},${ey + 4 * Math.sin((handAngle - 90) * Math.PI / 180)}`}
        fill="rgba(255, 140, 100, 0.85)"
      />
      <circle cx={ex} cy={ey} r={6} fill="#4a9eff" />
      <circle cx={ex} cy={ey} r={3} fill="#0d1528" />
    </>
  );


  const headerBlock = (
    <div style={{ padding: isMobile ? 'calc(8px + env(safe-area-inset-top)) 16px 0' : '24px 16px 0', fontFamily: 'system-ui, sans-serif', textAlign: isMobile ? 'center' : undefined }}>
      <div style={{ display: isMobile ? 'inline-block' : undefined, textAlign: 'left' }}>
        <div
          style={{
            color: dayBlend > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.35)',
            fontSize: isMobile ? (isSmallMobile ? 34 : 42) : 36,
            fontWeight: 100,
            lineHeight: 1.1,
            marginBottom: isMobile ? 24 : 0,
          }}
        >
          {now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
    </div>
  );

  const weatherModal = showWeatherModal && weatherForecast && (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={() => setShowWeatherModal(false)}
    >
      <div
        style={{
          maxWidth: 400,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 300,
          fontSize: 14,
          lineHeight: 1.6,
          textAlign: 'left',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 22, fontWeight: 100, color: 'rgba(255,255,255,0.4)', marginBottom: 20, textAlign: 'center' }}>
          {city.name} Forecast
        </div>
        {weatherForecast.split('\n\n').map((period, i) => (
          <div key={i} style={{ marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>
            {period}
          </div>
        ))}
        <div
          style={{
            marginTop: 24,
            color: 'rgba(255,255,255,0.25)',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          Source: NOAA/NWS
        </div>
        <div
          style={{
            marginTop: 12,
            color: 'rgba(255,255,255,0.25)',
            fontSize: 13,
            cursor: 'pointer',
            textAlign: 'center',
          }}
          onClick={() => setShowWeatherModal(false)}
        >
          tap to close
        </div>
      </div>
    </div>
  );

  const aboutPage = showAbout && (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={() => setShowAbout(false)}
    >
      <div
        style={{
          maxWidth: 400,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: 'system-ui, sans-serif',
          fontWeight: 300,
          fontSize: 16,
          lineHeight: 1.6,
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 28, fontWeight: 100, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Sun Moon Day</div>
        <div
          style={{
            marginBottom: 20,
            fontSize: 16,
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
          }}
          onClick={() => setShowCityPicker(!showCityPicker)}
        >
          {city.name} &#9662;
        </div>
        {showCityPicker && (
          <div style={{
            marginBottom: 16,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: '4px 0',
            maxHeight: 200,
            overflowY: 'auto',
          }}>
            {CITIES.map((c, i) => (
              <div
                key={c.name}
                onClick={() => { setCityIndex(i); setShowCityPicker(false); }}
                style={{
                  padding: '8px 20px',
                  color: i === cityIndex ? '#4a9eff' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: 15,
                }}
              >
                {c.name}
              </div>
            ))}
          </div>
        )}
        <div style={{
          marginBottom: 24,
          fontSize: 14,
          lineHeight: 1.8,
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'left',
          display: 'inline-block',
        }}>
          <div>sunrise {formatTime(sunrise)}</div>
          <div>sunset {formatTime(sunset)}</div>
          <div>moonrise {formatTime(moonrise)} {moonriseDir}</div>
          <div>moonset {formatTime(moonset)} {moonsetDir}</div>
        </div>
        <p style={{ marginBottom: 16 }}>
          A real-time astronomical clock showing the time of day, Earth's position in its yearly orbit around the Sun, and the current moon phase.
        </p>
        <p style={{ marginBottom: 32, color: 'rgba(255,255,255,0.4)' }}>
          Part of a family of apps for staying in touch with present experience.
        </p>
        <a
          href="https://apps.apple.com/us/app/trilog/id6754526159"
          onClick={(e) => {
            e.preventDefault();
            Browser.open({ url: 'itms-apps://itunes.apple.com/app/id6754526159' });
          }}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none',
            fontSize: 15,
            fontWeight: 300,
          }}
        >
          Try TriLog — Mindful Journaling
        </a>
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontSize: 14,
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          <span>Background:</span>
          <div
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 14,
            }}
            onClick={() => {
              const modes: ('darkBlue' | 'black' | 'daylight')[] = ['darkBlue', 'black', 'daylight'];
              const next = modes[(modes.indexOf(bgMode) + 1) % modes.length];
              setBgMode(next);
              localStorage.setItem('sunClock_bgMode', next);
            }}
          >
            {bgMode === 'darkBlue' ? 'Dark Blue' : bgMode === 'black' ? 'Black' : 'Daylight'}
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontSize: 14,
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          <span>Weather:</span>
          <div
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 14,
            }}
            onClick={() => {
              const next = !showWeather;
              setShowWeather(next);
              localStorage.setItem('sunClock_showWeather', String(next));
            }}
          >
            {showWeather ? 'On' : 'Off'}
          </div>
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
          US cities only (NOAA)
        </div>
        <div
          style={{
            marginTop: 24,
            color: 'rgba(255,255,255,0.25)',
            fontSize: 13,
            cursor: 'pointer',
          }}
          onClick={() => setShowAbout(false)}
        >
          tap to close
        </div>
        <div style={{ marginTop: 24, color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
          v{__APP_VERSION__} &copy; {new Date().getFullYear()} Joseph Orr
        </div>
      </div>
    </div>
  );

  const infoButton = (
    <div
      style={{
        position: 'absolute',
        top: isMobile ? 44 : 28,
        right: 16,
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: dayBlend > 0.5 ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: dayBlend > 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.45)',
        fontFamily: 'Georgia, serif',
        fontSize: 16,
        fontStyle: 'italic',
      }}
      onClick={() => setShowAbout(true)}
    >
      i
    </div>
  );

  // --- Mobile layout: stacked vertically ---
  if (isMobile) {
    const pad = 4;
    const earthViewSize = (MOON_RING_RADIUS + MOON_ICON_RADIUS + pad) * 2;
    const earthVBx = ex - earthViewSize / 2;
    const earthVBy = ey - earthViewSize / 2;

    // Crop the orbit view to just the content area
    const orbitPad = 115;
    const orbitViewSize = (ORBIT_RADIUS + orbitPad) * 2;
    const orbitVBx = CENTER - ORBIT_RADIUS - orbitPad;
    const orbitVBy = CENTER - ORBIT_RADIUS - orbitPad;

    return (
      <div style={{ position: 'relative', width: '100%', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {aboutPage}
        {weatherModal}
        {headerBlock}

        {/* Earth + moons — full width */}
        <svg
          viewBox={`${earthVBx} ${earthVBy} ${earthViewSize} ${earthViewSize}`}
          style={{ width: isSmallMobile ? '72%' : '85%', height: 'auto', margin: '-8px auto', display: 'block' }}
        >
          {moonRing}
          {earthContent}
        </svg>

        {/* Sun view with earth icon on orbit — cropped tight */}
        <svg
          viewBox={`${orbitVBx} ${orbitVBy} ${orbitViewSize} ${orbitViewSize}`}
          style={{ width: isSmallMobile ? '72%' : '85%', height: 'auto', margin: '-8px auto', display: 'block' }}
        >
          {STARS.map((s, i) => (
            <g key={i}>
              {s.glow && <circle cx={s.x} cy={s.y} r={s.r * 3} fill={`rgba(180, 200, 255, ${s.opacity * sky.starOpacity * 0.15})`} />}
              <circle cx={s.x} cy={s.y} r={s.r} fill={`rgba(220, 225, 255, ${s.opacity * sky.starOpacity})`} />
            </g>
          ))}
          <circle cx={CENTER} cy={CENTER} r={ORBIT_RADIUS} fill="none" stroke={dayBlend > 0.5 ? '#888' : '#556'} strokeWidth={1.5} />
          {seasons.map((s) => (
            <g key={s.label}>
              <text x={s.x} y={s.y} fill={dayBlend > 0.5 ? '#999' : '#667'} fontSize={24} fontFamily="system-ui, sans-serif" fontWeight={300} textAnchor={s.anchor}>{s.label}</text>
              <text x={s.x} y={s.y + s.dy} fill={dayBlend > 0.5 ? '#888' : '#445'} fontSize={16} fontFamily="system-ui, sans-serif" fontWeight={300} textAnchor={s.anchor}>{s.date}</text>
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

        {/* Info button — fixed bottom right */}
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom))',
            right: 14,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: dayBlend > 0.5 ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: dayBlend > 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.45)',
            fontFamily: 'Georgia, serif',
            fontSize: 16,
            fontStyle: 'italic',
            zIndex: 10,
          }}
          onClick={() => setShowAbout(true)}
        >
          i
        </div>
      </div>
    );
  }

  // --- Desktop layout: single SVG ---
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: SVG_SIZE }}>
    {aboutPage}
    {weatherModal}
    {infoButton}
    {headerBlock}
    <svg
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      style={{ width: '100%', height: 'auto' }}
    >
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={`rgba(200, 210, 255, ${s.opacity * sky.starOpacity})`} />
      ))}
      <circle cx={CENTER} cy={CENTER} r={ORBIT_RADIUS} fill="none" stroke={dayBlend > 0.5 ? '#888' : '#556'} strokeWidth={1.5} />
      {seasons.map((s) => (
        <g key={s.label}>
          <text x={s.x} y={s.y} fill={dayBlend > 0.5 ? '#999' : '#667'} fontSize={24} fontFamily="system-ui, sans-serif" fontWeight={300} textAnchor={s.anchor}>{s.label}</text>
          <text x={s.x} y={s.y + s.dy} fill={dayBlend > 0.5 ? '#888' : '#445'} fontSize={16} fontFamily="system-ui, sans-serif" fontWeight={300} textAnchor={s.anchor}>{s.date}</text>
        </g>
      ))}
      <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS} fill="#f5c842" />
      <circle cx={CENTER} cy={CENTER} r={SUN_RADIUS + 8} fill="none" stroke="#f5c84233" strokeWidth={4} />
      {moonRing}
      {earthContent}
    </svg>
    </div>
  );
}
