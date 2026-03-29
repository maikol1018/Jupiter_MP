import { BirthData, NatalData, Planet, ViewMode } from '../types';
// @ts-ignore
import * as Astronomy from 'astronomy-engine';
const { Body, Equator, SiderealTime, MakeTime, Observer } = Astronomy;

const API_BASE_URL = 'http://localhost:8000/api';

// Standard bodies list
const BODY_DEFINITIONS = [
  { name: 'Sun', id: Body.Sun },
  { name: 'Moon', id: Body.Moon },
  { name: 'Mercury', id: Body.Mercury },
  { name: 'Venus', id: Body.Venus },
  { name: 'Mars', id: Body.Mars },
  { name: 'Jupiter', id: Body.Jupiter },
  { name: 'Saturn', id: Body.Saturn },
  { name: 'Uranus', id: Body.Uranus },
  { name: 'Neptune', id: Body.Neptune },
  { name: 'Pluto', id: Body.Pluto },
];

// --- Math Helpers ---
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const normalize = (deg: number) => {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
};

const d2r = (deg: number) => deg * D2R;
const r2d = (rad: number) => rad * R2D;

// --- Core Astronomy Functions ---

/**
 * Calculate Obliquity of Ecliptic (True) for a given Julian Day.
 * Uses IAU 2006 precession model approximation.
 */
const calcTrueObliquity = (jd: number) => {
  const T = (jd - 2451545.0) / 36525.0;
  const eps0 = 23.0 + 26.0/60.0 + 21.448/3600.0 - (46.8150/3600.0)*T - (0.00059/3600.0)*T*T + (0.001813/3600.0)*T*T*T;
  return eps0;
};

/**
 * Convert Equatorial Coordinates (RA, Dec) to Ecliptic Coordinates (Lon, Lat).
 * Both input and output in Degrees.
 */
const equatorToEcliptic = (raDeg: number, decDeg: number, epsDeg: number) => {
  const ra = d2r(raDeg);
  const dec = d2r(decDeg);
  const eps = d2r(epsDeg);

  const sinLon = Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps);
  const cosLon = Math.cos(ra);
  
  const lon = r2d(Math.atan2(sinLon, cosLon));
  
  const sinLat = Math.sin(dec) * Math.cos(eps) - Math.cos(dec) * Math.sin(eps) * Math.sin(ra);
  const lat = r2d(Math.asin(sinLat));

  return { lon: normalize(lon), lat };
};

/**
 * Calculate True North Node (Meeus / IAU).
 * More accurate than Mean Node.
 */
const calcTrueNode = (jd: number) => {
  const T = (jd - 2451545.0) / 36525.0;
  
  // Mean Elongation of Moon
  const D = 297.85036 + 445267.111480 * T - 0.0019142 * T * T + T * T * T / 189474;
  // Mean Anomaly of Sun
  const M = 357.52772 + 35999.050340 * T - 0.0001603 * T * T - T * T * T / 300000;
  // Mean Anomaly of Moon
  const M_prime = 134.96298 + 477198.867398 * T + 0.0086972 * T * T + T * T * T / 56250;
  // Argument of Latitude (Mean)
  const F = 93.27191 + 483202.017538 * T - 0.0036825 * T * T + T * T * T / 327270;
  // Mean Longitude of Ascending Node
  const Omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000;

  const dr = Math.PI / 180;
  const rD = D * dr;
  const rM = M * dr;
  const rMp = M_prime * dr;
  const rF = F * dr;

  // Corrections for True Node (Terms > 0.01 deg)
  let dOmega = -1.4979 * Math.sin(2 * rD - 2 * rF)
             - 0.1500 * Math.sin(rM)
             - 0.1226 * Math.sin(2 * rD)
             + 0.1176 * Math.sin(2 * rF)
             - 0.0801 * Math.sin(2 * rMp);
  
  return normalize(Omega + dOmega);
};

// --- House System Logic ---

/**
 * Strict Placidus House System Algorithm.
 * 
 * @param ramcDeg Right Ascension of the Meridian (Degrees)
 * @param latDeg Geographic Latitude (Degrees)
 * @param epsDeg Obliquity of the Ecliptic (Degrees)
 */
const calculatePlacidus = (ramcDeg: number, latDeg: number, epsDeg: number) => {
  const cusps = new Array(13).fill(0);
  const eps = d2r(epsDeg);
  const latRad = d2r(latDeg);
  
  // 1. Calculate MC (Medium Coeli) - Cusp 10
  // MC is the point on the ecliptic whose RA is RAMC.
  const ramcRad = d2r(ramcDeg);
  const mcRad = Math.atan2(Math.sin(ramcRad), Math.cos(ramcRad) * Math.cos(eps));
  const mc = normalize(r2d(mcRad));
  
  cusps[10] = mc;
  cusps[4] = normalize(mc + 180); // IC

  // 2. Calculate ASC (Ascendant) - Cusp 1
  // ASC is the intersection of Ecliptic and Horizon.
  // Formula: tan(ASC) = cos(RAMC) / - (sin(RAMC)*cos(eps) + tan(lat)*sin(eps))
  // The sign inversion is critical to distinguish ASC from DSC.
  const ascY = Math.cos(ramcRad);
  const ascX = -(Math.sin(ramcRad) * Math.cos(eps) + Math.tan(latRad) * Math.sin(eps));
  const asc = normalize(r2d(Math.atan2(ascY, ascX)));
  
  cusps[1] = asc;
  cusps[7] = normalize(asc + 180); // DSC

  // 3. Iterative Calculation for Intermediate Cusps
  const calcCusp = (houseIdx: number, raTargetOffset: number, factor: number) => {
    let RA = normalize(ramcDeg + raTargetOffset);
    
    // Iterate to converge (usually 3-5 iterations needed)
    for (let i = 0; i < 10; i++) {
        const raRad = d2r(RA);
        // Find Declination (delta) of the Ecliptic at this RA
        const decRad = Math.atan(Math.tan(eps) * Math.sin(raRad));
        
        // Calculate Ascensional Difference (AD)
        let sinAD = Math.tan(latRad) * Math.tan(decRad);
        
        // Clamp for high latitudes
        if (sinAD > 1) sinAD = 1;
        if (sinAD < -1) sinAD = -1;
        
        const AD = r2d(Math.asin(sinAD));
        
        // Placidus Semi-Arc Formula
        let nextRA = 0;
        
        // DSA = 90° + AD (Diurnal Semi-Arc)
        // NSA = 90° - AD (Nocturnal Semi-Arc)
        // Cusps 11,12: RAMC + DSA×fraction = RAMC + (90+AD)×fraction
        // Cusps 2,3: RAMC + DSA + NSA×fraction = RAMC + (90+AD) + (90-AD)×fraction
        if (houseIdx === 11) nextRA = ramcDeg + 30 + (AD / 3);
        else if (houseIdx === 12) nextRA = ramcDeg + 60 + (2 * AD / 3);
        else if (houseIdx === 2) nextRA = ramcDeg + 120 + (2 * AD / 3);
        else if (houseIdx === 3) nextRA = ramcDeg + 150 + (AD / 3);
        
        RA = normalize(nextRA);
    }
    
    // Convert Final RA to Ecliptic Longitude
    const finalRaRad = d2r(RA);
    const lonRad = Math.atan2(Math.sin(finalRaRad), Math.cos(finalRaRad) * Math.cos(eps));
    return normalize(r2d(lonRad));
  };

  try {
      if (Math.abs(latDeg) > 66) throw new Error("Placidus undefined at high lat");
      
      cusps[11] = calcCusp(11, 30, 1/3);
      cusps[12] = calcCusp(12, 60, 2/3);
      cusps[2] = calcCusp(2, 120, 2/3);
      cusps[3] = calcCusp(3, 150, 1/3);
      
      // Opposite Cusps
      cusps[5] = normalize(cusps[11] + 180);
      cusps[6] = normalize(cusps[12] + 180);
      cusps[8] = normalize(cusps[2] + 180);
      cusps[9] = normalize(cusps[3] + 180);
  } catch (e) {
      console.warn("Placidus failed (Polar Circle?), falling back to Porphyry");
      // Porphyry Fallback logic
      let q1 = normalize(cusps[4] - cusps[1]);
      if (q1 < 0) q1 += 360;
      const s1 = q1 / 3;
      cusps[2] = normalize(cusps[1] + s1);
      cusps[3] = normalize(cusps[1] + s1 * 2);
      
      let q2 = normalize(cusps[7] - cusps[4]);
      if (q2 < 0) q2 += 360;
      const s2 = q2 / 3;
      cusps[5] = normalize(cusps[4] + s2);
      cusps[6] = normalize(cusps[4] + s2 * 2);
      
      cusps[8] = normalize(cusps[2] + 180);
      cusps[9] = normalize(cusps[3] + 180);
      cusps[11] = normalize(cusps[5] + 180);
      cusps[12] = normalize(cusps[6] + 180);
  }

  return cusps;
};

// --- Main Calculator ---

export const calculateProfessionalData = (data: BirthData): NatalData => {
  // ═══ Step 1: 出生时间（时区时间）+ 出生地经纬度 → 地方平均时(LMT) ═══
  // timezone 默认为 8 (中国标准时间 UTC+8)，标准子午线 = timezone × 15°
  const timezone = data.timezone !== undefined ? data.timezone : 8;
  const standardMeridian = timezone * 15;
  const lmtCorrectionHours = (data.lon - standardMeridian) / 15;
  const lmtHour = data.hour + lmtCorrectionHours;

  // ═══ Step 2: 地方平均时(LMT) → 格林威治时间(GMT/UT) ═══
  // GMT = LMT - (出生地经度 / 15)
  const gmtHour = lmtHour - data.lon / 15;

  const date = new Date(Date.UTC(data.year, data.month - 1, data.day, 0, 0, 0));
  date.setTime(date.getTime() + gmtHour * 3600 * 1000);

  const astroTime = Astronomy.MakeTime(date);
  const jd = astroTime.ut;

  // ═══ Step 3: 用星历表查行星星座及度数 (Geocentric Ecliptic) ═══
  const eps = calcTrueObliquity(jd);
  // 使用地心坐标 (Observer at 0,0,0 ≈ geocentric)
  const geocentricObs = new Astronomy.Observer(0, 0, 0);

  const planets: Planet[] = BODY_DEFINITIONS.map(b => {
    const eq = Astronomy.Equator(b.id, astroTime, geocentricObs, true, true);
    const ecl = equatorToEcliptic(eq.ra * 15, eq.dec, eps);

    const timeNext = Astronomy.MakeTime(new Date(date.getTime() + 3600000));
    const eqNext = Astronomy.Equator(b.id, timeNext, geocentricObs, true, true);
    const eclNext = equatorToEcliptic(eqNext.ra * 15, eqNext.dec, eps);

    let speed = eclNext.lon - ecl.lon;
    if (speed > 180) speed -= 360;
    if (speed < -180) speed += 360;

    return { name: b.name, lon: ecl.lon, speed };
  });

  const northNodeLon = calcTrueNode(jd);
  planets.push({ name: 'North Node', lon: northNodeLon, speed: 0 });
  planets.push({ name: 'South Node', lon: normalize(northNodeLon + 180), speed: 0 });

  // ═══ Step 4: 格林威治恒星时(GMST) + 出生地经纬度 → 普拉西德斯(Placidus)宫位 ═══
  // GMST × 15 + 出生地经度 = RAMC (本地恒星时，度数)
  const gmst = Astronomy.SiderealTime(astroTime);
  const ramc = normalize(gmst * 15 + data.lon);
  // 代入 RAMC + 出生地纬度 + 黄赤交角 → Placidus 宫位表得到四轴及宫位
  const cusps = calculatePlacidus(ramc, data.lat, eps);

  return {
    jd,
    planets,
    houses: { cusps, asc: cusps[1], mc: cusps[10] },
    angles: { ASC: cusps[1], MC: cusps[10] }
  };
};

const calculateOverlayPlanets = (baseJd: number, date: Date, mode: ViewMode, natalData?: NatalData, birthConfig?: BirthData): Planet[] => {
  const targetTime = Astronomy.MakeTime(date);
  const targetJd = targetTime.ut;
  
  if (mode === ViewMode.PROGRESSION && natalData && birthConfig) {
    // 1 year = 1 day progression
    const deltaDays = targetJd - baseJd;
    const progOffsetDays = deltaDays / 365.242199;
    const progJd = baseJd + progOffsetDays;
    
    const progDate = Astronomy.MakeTime(progJd);
    const eps = calcTrueObliquity(progJd);
    const observer = new Astronomy.Observer(0, 0, 0); 
    
    const planets: Planet[] = BODY_DEFINITIONS.map(b => {
      const eq = Astronomy.Equator(b.id, progDate, observer, true, true);
      const ecl = equatorToEcliptic(eq.ra * 15, eq.dec, eps);
      return { name: b.name, lon: ecl.lon, speed: 0 };
    });
    
    // Calculate Solar Arc MC
    const natalSun = natalData.planets.find(p => p.name === 'Sun')?.lon || 0;
    const progSun = planets.find(p => p.name === 'Sun')?.lon || 0;
    const solarArc = (progSun - natalSun) % 360;
    
    const natalMc = natalData.angles.MC;
    const progMc = normalize(natalMc + solarArc);
    
    // Reverse engineer RAMC from progMc
    const mcRad = d2r(progMc);
    const epsRad = d2r(eps);
    // tan(ramc) = tan(mc) * cos(eps)
    const progRamcRad = Math.atan2(Math.sin(mcRad) * Math.cos(epsRad), Math.cos(mcRad));
    const progRamc = normalize(r2d(progRamcRad));
    
    const cusps = calculatePlacidus(progRamc, birthConfig.lat, eps);
    const progAsc = cusps[1];
    
    planets.push({ name: 'ASC', lon: progAsc, speed: 0 });
    planets.push({ name: 'MC', lon: progMc, speed: 0 });
    
    return planets;
  }

  // Default Transit mode
  const eps = calcTrueObliquity(targetJd);
  const observer = new Astronomy.Observer(0, 0, 0); 

  const planets: Planet[] = BODY_DEFINITIONS.map(b => {
    const eq = Astronomy.Equator(b.id, targetTime, observer, true, true);
    const ecl = equatorToEcliptic(eq.ra * 15, eq.dec, eps);
    return { name: b.name, lon: ecl.lon, speed: 0 };
  });

  return planets;
};

// --- API ---

export const fetchNatalChart = async (data: BirthData): Promise<NatalData> => {
    console.log("Calculating Strict Placidus Chart...");
    return calculateProfessionalData(data);
};

export const fetchOverlayPlanets = async (baseJd: number, date: Date, mode: ViewMode, natalData?: NatalData, birthConfig?: BirthData): Promise<Planet[]> => {
    return calculateOverlayPlanets(baseJd, date, mode, natalData, birthConfig);
};