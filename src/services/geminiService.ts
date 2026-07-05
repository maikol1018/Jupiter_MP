import { NatalData, BirthData, ViewMode } from '../types';
import Taro from '@tarojs/taro';
import { fetchOverlayPlanets } from './astroService';
import { ASPECT_CONFIG, PLANET_NAMES_CN, ZODIAC_SIGNS } from '../constants';
import { callGemini } from './apiService';

const formatDegree = (lon: number) => {
  const normalizedLon = ((lon % 360) + 360) % 360;
  const totalSeconds = Math.round(normalizedLon * 3600) % (360 * 3600);
  const signIndex = Math.floor(totalSeconds / (30 * 3600));
  const secondsInSign = totalSeconds - signIndex * 30 * 3600;
  const degrees = Math.floor(secondsInSign / 3600);
  const minutes = Math.floor((secondsInSign % 3600) / 60);
  const seconds = secondsInSign % 60;

  return `${ZODIAC_SIGNS[signIndex]?.nameCN} ${degrees}°${String(minutes).padStart(2, '0')}′${String(seconds).padStart(2, '0')}″`;
};

const getLangInstruction = (includeAstrologyTerms: boolean): string =>
  includeAstrologyTerms
    ? "请在分析中充分运用中文行星名称、星座名称、宫位等占星专业术语。"
    : "【强制语言规范】本报告严格禁止出现任何占星专业术语，包括：行星名称（太阳、月亮、水星、金星、火星、木星、土星、天王星、海王星、冥王星、北交点、南交点）、星座名称（白羊座、金牛座、双子座、巨蟹座、狮子座、处女座、天秤座、天蝎座、射手座、摩羯座、水瓶座、双鱼座）、宫位（如第1宫、第2宫等）、相位名称（合相、冲相、刑相、三分相、六分相等），以及任何其他占星专有词汇（上升点、中天、行运、次限、本命盘等）。请将所有洞察完全转化为通俗易懂的日常语言。";

const getNoTermsSystemInst = (includeAstrologyTerms: boolean, extra?: string): string | undefined => {
  if (includeAstrologyTerms) return extra || undefined;
  const base = "严格禁止在输出中使用任何占星专业术语，包括行星名（太阳、月亮、水星、金星、火星、木星、土星、天王星、海王星、冥王星）、星座名（十二星座任何名称）、宫位（第N宫）、相位（合相、冲相等），以及上升点、中天、行运、次限、本命盘等。所有分析必须以通俗日常语言表达。";
  return extra ? base + " " + extra : base;
};

const DAILY_AI_PROVIDER = process.env.JUPITER_DAILY_PROVIDER === 'qwen' ? 'qwen' : 'gemini';

const REPORT_LENGTH_INSTRUCTION = "【篇幅限制】请输出精炼版报告，总长度控制为常规版本约70%；每个小节保留关键判断与行动建议，避免重复铺陈。";
const STRICT_ASTRO_DATA_INSTRUCTION = "【星历约束】必须严格基于下方提供的星体度数、普拉西宫位、落宫与相位触发清单分析。不得自行推演、补造、改写任何星历位置；不得提及未列在触发清单中的换座、过宫、相位、日月食或其他星象。";

const getPointLabel = (name: string) => PLANET_NAMES_CN[name] || name;
const ANNUAL_TRANSIT_BACKGROUND_POINTS = new Set(['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'North Node', 'South Node']);

const ELEMENT_BY_SIGN = ['火', '土', '风', '水', '火', '土', '风', '水', '火', '土', '风', '水'];
const MODALITY_BY_SIGN = ['开创', '固定', '变动', '开创', '固定', '变动', '开创', '固定', '变动', '开创', '固定', '变动'];
const ELEMENT_LABELS: Record<string, string> = {
  火: '点燃型',
  土: '筑形型',
  风: '连结型',
  水: '感应型',
};
const MODALITY_LABELS: Record<string, string> = {
  开创: '开路节奏',
  固定: '定锚节奏',
  变动: '调频节奏',
};
const INNER_MANUAL_ARCHETYPES: Record<string, { title: string; symbol: string; keywords: string[]; tone: string }> = {
  火开创: { title: '晨光开路者', symbol: '☉', keywords: ['启动', '直觉', '行动'], tone: '先点亮方向，再修正路径' },
  火固定: { title: '炉心守光者', symbol: '♌', keywords: ['热情', '定力', '创造'], tone: '把热爱烧成稳定作品' },
  火变动: { title: '星火旅人', symbol: '♐', keywords: ['探索', '扩张', '鼓舞'], tone: '在变化中寻找更大的意义' },
  土开创: { title: '山径建造者', symbol: '♑', keywords: ['结构', '负责', '推进'], tone: '用现实步骤把目标落地' },
  土固定: { title: '花园守成者', symbol: '♉', keywords: ['稳定', '耐心', '价值'], tone: '慢慢积累，稳稳兑现' },
  土变动: { title: '细节修整师', symbol: '♍', keywords: ['整理', '改善', '服务'], tone: '在细节里恢复秩序' },
  风开创: { title: '桥梁发起人', symbol: '♎', keywords: ['协商', '关系', '平衡'], tone: '让不同的人与观点找到接口' },
  风固定: { title: '远景编织者', symbol: '♒', keywords: ['系统', '社群', '未来'], tone: '把想法织成可共享的网络' },
  风变动: { title: '讯息翻译者', symbol: '♊', keywords: ['学习', '表达', '流动'], tone: '快速捕捉，再转译给世界' },
  水开创: { title: '潮汐守护者', symbol: '♋', keywords: ['照顾', '安全', '感受'], tone: '先安顿情绪，再展开行动' },
  水固定: { title: '深井洞察者', symbol: '♏', keywords: ['深度', '转化', '信任'], tone: '穿过表面，看见真正动机' },
  水变动: { title: '梦境导航者', symbol: '♓', keywords: ['想象', '共感', '融合'], tone: '让直觉成为温柔的导航' },
};

export interface InnerManualPortrait {
  modeName: string;
  symbol: string;
  rhythm: string;
  focus: string;
  tone: string;
  keywords: string[];
  palette: string[];
}

const getAnnualTransitBackgroundPoints = (points: { name: string; lon: number; speed?: number }[]) => (
  points.filter(point => ANNUAL_TRANSIT_BACKGROUND_POINTS.has(point.name))
);

const getSignIndex = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 30);

const addWeightedSign = (scores: Record<string, number>, labels: string[], lon: number, weight: number) => {
  const label = labels[getSignIndex(lon)];
  scores[label] = (scores[label] || 0) + weight;
};

const getTopScore = (scores: Record<string, number>) => (
  Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
);

const getDominantHouseFocus = (natalData: NatalData) => {
  const focusScores: Record<string, number> = { 自我启动: 0, 资源积累: 0, 关系协作: 0, 事业表达: 0, 内在整合: 0 };
  const weights: Record<string, number> = { Sun: 3, Moon: 3, Mercury: 1.5, Venus: 1.5, Mars: 1.5, Jupiter: 1.2, Saturn: 1.2, ASC: 2, MC: 2 };
  getNatalPoints(natalData).forEach(point => {
    const house = getHouseNumber(point.lon, natalData);
    const weight = weights[point.name] || 0.6;
    if ([1, 5, 9].includes(house || 0)) focusScores.自我启动 += weight;
    else if ([2, 6, 10].includes(house || 0)) focusScores.资源积累 += weight;
    else if ([3, 7, 11].includes(house || 0)) focusScores.关系协作 += weight;
    else if ([4, 8, 12].includes(house || 0)) focusScores.内在整合 += weight;
    if ([10, 11, 6].includes(house || 0)) focusScores.事业表达 += weight * 0.8;
  });
  return getTopScore(focusScores) || '自我启动';
};

export const getInnerManualPortrait = (natalData: NatalData): InnerManualPortrait => {
  const elementScores: Record<string, number> = { 火: 0, 土: 0, 风: 0, 水: 0 };
  const modalityScores: Record<string, number> = { 开创: 0, 固定: 0, 变动: 0 };
  const weights: Record<string, number> = {
    Sun: 3,
    Moon: 3,
    Mercury: 1.5,
    Venus: 1.5,
    Mars: 1.5,
    Jupiter: 1,
    Saturn: 1,
    Uranus: 0.6,
    Neptune: 0.6,
    Pluto: 0.6,
    'North Node': 0.8,
    'South Node': 0.8,
    ASC: 2.5,
    MC: 2,
  };
  getNatalPoints(natalData).forEach(point => {
    const weight = weights[point.name] || 0.5;
    addWeightedSign(elementScores, ELEMENT_BY_SIGN, point.lon, weight);
    addWeightedSign(modalityScores, MODALITY_BY_SIGN, point.lon, weight);
  });

  const element = getTopScore(elementScores) || '风';
  const modality = getTopScore(modalityScores) || '变动';
  const archetype = INNER_MANUAL_ARCHETYPES[`${element}${modality}`] || INNER_MANUAL_ARCHETYPES.风变动;
  return {
    modeName: archetype.title,
    symbol: archetype.symbol,
    rhythm: `${ELEMENT_LABELS[element]} · ${MODALITY_LABELS[modality]}`,
    focus: getDominantHouseFocus(natalData),
    tone: archetype.tone,
    keywords: archetype.keywords,
    palette: element === '火' ? ['#c97b6e', '#e8a882', '#f7d7b5']
      : element === '土' ? ['#9a6a4f', '#d4a373', '#f2dfc7']
      : element === '水' ? ['#8f6f61', '#c97b6e', '#f3d9cf']
      : ['#7a5d50', '#c97b6e', '#f5ece0'],
  };
};

const getAngularDistance = (a: number, b: number) => {
  const diff = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return diff;
};

const isWithinArc = (lon: number, start: number, end: number) => {
  const point = ((lon % 360) + 360) % 360;
  const from = ((start % 360) + 360) % 360;
  const to = ((end % 360) + 360) % 360;
  return from <= to ? point >= from && point < to : point >= from || point < to;
};

const getHouseNumber = (lon: number, natalData: NatalData) => {
  const cusps = natalData.houses?.cusps || [];
  for (let house = 1; house <= 12; house++) {
    const start = cusps[house];
    const end = cusps[house === 12 ? 1 : house + 1];
    if (typeof start === 'number' && typeof end === 'number' && isWithinArc(lon, start, end)) {
      return house;
    }
  }
  return undefined;
};

const getNatalPoints = (natalData: NatalData) => [
  ...natalData.planets,
  { name: 'ASC', lon: natalData.angles.ASC, speed: 0 },
  { name: 'MC', lon: natalData.angles.MC, speed: 0 },
];

const formatPointLine = (name: string, lon: number, natalData?: NatalData) => {
  const house = natalData ? getHouseNumber(lon, natalData) : undefined;
  const houseText = house ? `，落本命第${house}宫` : '';
  return `  - ${getPointLabel(name)}：${formatDegree(lon)}${houseText}`;
};

const formatHouseCusps = (natalData: NatalData) => {
  const cusps = natalData.houses?.cusps || [];
  return Array.from({ length: 12 }, (_, index) => {
    const house = index + 1;
    return `  - 第${house}宫：${formatDegree(cusps[house] || 0)}`;
  }).join('\n');
};

const getAspectLines = (
  sourcePoints: { name: string; lon: number }[],
  targetPoints: { name: string; lon: number }[],
  sourcePrefix: string,
  targetPrefix: string,
  maxItems = 18,
) => {
  const aspects: { text: string; orb: number }[] = [];

  sourcePoints.forEach(source => {
    targetPoints.forEach(target => {
      if (sourcePrefix === targetPrefix && source.name >= target.name) return;
      const distance = getAngularDistance(source.lon, target.lon);
      ASPECT_CONFIG.forEach(aspect => {
        const orb = Math.abs(distance - aspect.angle);
        if (orb <= aspect.orb) {
          aspects.push({
            orb,
            text: `  - ${sourcePrefix}${getPointLabel(source.name)} ${aspect.labelCN} ${targetPrefix}${getPointLabel(target.name)}（容许度 ${orb.toFixed(2)}°）`,
          });
        }
      });
    });
  });

  return aspects
    .sort((a, b) => a.orb - b.orb)
    .slice(0, maxItems)
    .map(item => item.text)
    .join('\n') || '  - 无主要相位触发';
};

const formatMonthRanges = (months: number[]) => {
  const sorted = Array.from(new Set(months)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    ranges.push(start === prev ? `${start}月` : `${start}-${prev}月`);
    start = current;
    prev = current;
  }

  return ranges.join('、');
};

const getAnnualAspectTimingText = async (
  year: number,
  natalData: NatalData,
  birthConfig: BirthData,
  mode: ViewMode,
  title: string,
) => {
  const natalPoints = getNatalPoints(natalData);
  const records = new Map<string, {
    months: number[];
    minOrb: number;
    source: string;
    target: string;
    aspect: string;
  }>();

  const monthlyOverlays = await Promise.all(
    Array.from({ length: 12 }, (_, month) => {
      const date = new Date(Date.UTC(year, month, 15));
      return fetchOverlayPlanets(natalData.jd, date, mode, natalData, birthConfig)
        .then(points => ({ month: month + 1, points }));
    })
  );

  monthlyOverlays.forEach(({ month, points }) => {
    points.forEach(source => {
      natalPoints.forEach(target => {
        const distance = getAngularDistance(source.lon, target.lon);
        ASPECT_CONFIG.forEach(aspect => {
          const orb = Math.abs(distance - aspect.angle);
          if (orb > aspect.orb) return;
          const key = `${source.name}|${aspect.labelCN}|${target.name}`;
          const existing = records.get(key);
          if (existing) {
            existing.months.push(month);
            existing.minOrb = Math.min(existing.minOrb, orb);
          } else {
            records.set(key, {
              months: [month],
              minOrb: orb,
              source: getPointLabel(source.name),
              target: getPointLabel(target.name),
              aspect: aspect.labelCN,
            });
          }
        });
      });
    });
  });

  const lines = Array.from(records.values())
    .sort((a, b) => a.minOrb - b.minOrb)
    .slice(0, 28)
    .map(record => `  - ${title}${record.source} ${record.aspect} 本命${record.target}：${formatMonthRanges(record.months)}（最小容许度 ${record.minOrb.toFixed(2)}°）`);

  return lines.join('\n') || '  - 全年无主要相位触发月份';
};

const getNatalSnapshotText = (natalData: NatalData) => {
  const natalPoints = getNatalPoints(natalData);
  return `普拉西宫位表：\n${formatHouseCusps(natalData)}\n\n本命星体落宫：\n${natalPoints.map(point => formatPointLine(point.name, point.lon, natalData)).join('\n')}\n\n本命主要相位（已计算）：\n${getAspectLines(natalPoints, natalPoints, '本命', '本命', 16)}`;
};

const getOverlaySnapshotText = (
  title: string,
  overlayPoints: { name: string; lon: number }[],
  natalData: NatalData,
) => {
  const natalPoints = getNatalPoints(natalData);
  return `${title}星体位置与本命落宫：\n${overlayPoints.map(point => formatPointLine(point.name, point.lon, natalData)).join('\n')}\n\n${title}对本命盘主要相位（已计算）：\n${getAspectLines(overlayPoints, natalPoints, '', '本命', 20)}`;
};

// ── 微信小程序 localStorage 替代 ────────────────────────
const mpStorage = {
  getItem: (key: string): string | null => {
    try { return Taro.getStorageSync(key) || null; } catch (_error) { return null; }
  },
  setItem: (key: string, value: string) => {
    try { Taro.setStorageSync(key, value); } catch (_error) {}
  }
};

export const generateAnnualReport = async (
  natalData: NatalData,
  birthConfig: BirthData,
  category: string,
  year: number,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const midYearDate = new Date(Date.UTC(year, 6, 1));
  let transits, progressions;
  try {
    [transits, progressions] = await Promise.all([
      fetchOverlayPlanets(natalData.jd, midYearDate, ViewMode.TRANSIT, natalData, birthConfig),
      fetchOverlayPlanets(natalData.jd, midYearDate, ViewMode.PROGRESSION, natalData, birthConfig),
    ]);
  } catch (e: any) {
    throw new Error('推运计算失败: ' + (e?.message || String(e)));
  }
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const annualTransitBackground = getAnnualTransitBackgroundPoints(transits);
  const annualTransitBackgroundStr = annualTransitBackground.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const progressionDataStr = progressions.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const natalSnapshotStr = getNatalSnapshotText(natalData);
  const transitSnapshotStr = getOverlaySnapshotText(`${year}年7月1日慢行星与交点行运背景`, annualTransitBackground, natalData);
  const progressionSnapshotStr = getOverlaySnapshotText(`${year}年7月1日次限盘`, progressions, natalData);
  const [transitTimingStr, progressionTimingStr] = await Promise.all([
    getAnnualAspectTimingText(year, natalData, birthConfig, ViewMode.TRANSIT, '行运'),
    getAnnualAspectTimingText(year, natalData, birthConfig, ViewMode.PROGRESSION, '次限'),
  ]);

  const prompt = `
请根据以下用户的本命星盘数据，为他们生成一份关于"${category}"的 ${year}年 年度复盘分析报告。
${getLangInstruction(includeAstrologyTerms)}
${REPORT_LENGTH_INSTRUCTION}
${STRICT_ASTRO_DATA_INSTRUCTION}
请注意：
1. 语言风格尽量符合年轻人，轻松、有共鸣，但不要浮夸或过度娱乐化。
2. 结合下方已计算的本命盘落宫与主要相位，不得新增未列出的相位。
3. 年度行运背景只可使用下方「慢行星与交点行运背景」（木星、土星、天王星、海王星、冥王星、南北交点）；不得把太阳、月亮、水星、金星、火星在某一天的落宫写成全年主题。
4. 结合下方已计算的 ${year} 年7月1日次限盘（Secondary Progression）落本命宫位与相位触发清单，不得自行补充未列出的过宫或相位。
5. 综合行运盘（Transit）和次限盘（Progression），只有当下方触发清单明确显示相同主题或相位时，才可指出“双重强调”。
6. 给出实用的行动建议，定位为「行为参考」而非预测。
7. 务必严格基于下方提供的行运盘和次限盘星体度数进行分析，切勿自行推演或编造星体位置。
8. 描述星盘宫位时，请统一使用"宫"字，例如"第6宫"、"6宫"，绝对不要使用"室"字（如"6室"）。
9. 凡是报告中提到任何行运或次限相位，必须在同一句或同一段明确写出下方时间轴提供的月份或月份范围；如果时间轴没有列出该相位，就不要提。
10. 凡是提到行运太阳、月亮、水星、金星、火星，只能作为短期触发描述，并且必须绑定月份/月段；不得写成“这一年金星落入第7宫，因此全年关系主题增强”这类表述。
11. 建议输出 4-6 个小节，每节 2-4 句，避免长篇背景解释。

用户出生信息：
${birthConfig.name ? `- 姓名：${birthConfig.name}` : ''}
- 出生日期：${birthConfig.year}年${birthConfig.month}月${birthConfig.day}日
- 出生地点：${birthConfig.city}

本命盘关键数据：
- 上升星座 (ASC) 黄经：${formatDegree(natalData.angles.ASC)}
- 中天 (MC) 黄经：${formatDegree(natalData.angles.MC)}
- 行星位置：
${natalData.planets.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

本命盘确定性计算结果：
${natalSnapshotStr}

${year}年年中（7月1日）慢行星与交点行运背景（仅这些可作为年度背景）：
${annualTransitBackgroundStr}

${transitSnapshotStr}

${year}年行运相位逐月触发时间轴（已计算，报告提到相位时必须引用这些月份/月段）：
${transitTimingStr}

${year}年年中（7月1日）次限盘（Progression）关键数据：
- 行星位置：
${progressionDataStr}

${progressionSnapshotStr}

${year}年次限相位逐月触发时间轴（已计算，报告提到相位时必须引用这些月份/月段）：
${progressionTimingStr}

请直接输出报告内容，可以使用Markdown格式。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const generateInnerManualReport = async (
  natalData: NatalData,
  birthConfig: BirthData,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const natalSnapshotStr = getNatalSnapshotText(natalData);
  const portrait = getInnerManualPortrait(natalData);
  const prompt = `
请根据以下用户的本命星盘，生成一份「内在使用说明」。
${getLangInstruction(includeAstrologyTerms)}
${REPORT_LENGTH_INSTRUCTION}
【分析范围】只能分析本命图。严禁使用、提及或推演任何行运、次限、流年、流月、年度预测、未来事件或当下运势。
【表达原则】这不是人格测评、心理诊断或定型分类。请把分类称为「主使用模式」，意思是用户更顺手的运行方式，不代表用户只能这样。
【分类方案】本系统采用 4 元素倾向 × 3 行动节奏，共 12 种主使用模式。当前计算出的主使用模式是「${portrait.modeName}」，节奏为「${portrait.rhythm}」，重点使用场景为「${portrait.focus}」。请以此作为开场画像，但必须说明它是使用说明，不是标签。
【画像卡】报告开头请先输出一个「人物画像卡」小节，包含：主使用模式、一句话画像、关键词、顺手的环境、容易卡住的场景。不要输出图片链接，不要要求用户上传照片。
【内容结构】建议输出 5 个小节：人物画像卡、天赋使用方式、情绪与关系说明、工作/创造说明、给自己的提醒。每节 2-4 句，温柔、准确、具体。
【禁止】不要写“你就是某种人”“你一定会”“命中注定”。不要使用 MBTI、九型人格、DISC 等外部量表名称来给用户贴标签。

用户出生信息：
${birthConfig.name ? `- 姓名：${birthConfig.name}` : ''}
- 出生日期：${birthConfig.year}年${birthConfig.month}月${birthConfig.day}日
- 出生地点：${birthConfig.city}

本命盘关键数据：
- 上升星座 (ASC) 黄经：${formatDegree(natalData.angles.ASC)}
- 中天 (MC) 黄经：${formatDegree(natalData.angles.MC)}
- 行星位置：
${natalData.planets.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

本命盘确定性计算结果：
${natalSnapshotStr}

请直接输出报告内容，可以使用Markdown格式。
`;

  return callGemini({
    prompt,
    systemInstruction: getNoTermsSystemInst(includeAstrologyTerms, '只能分析本命图，不得提及行运、次限、流年或任何未来预测。分类只能称为“主使用模式”，不得写成人格标签。'),
  });
};

const hasCompleteDailyDressGuide = (text: string) => {
  if (/今日运势分析|场景|提醒|替代|理由\s*[：:]/.test(text)) return false;

  const soulStart = text.indexOf('**心灵气象站**');
  const dressStart = text.indexOf('**穿衣指南**');
  if (soulStart < 0 || dressStart < 0 || dressStart <= soulStart) return false;

  const soulSection = text.slice(soulStart + '**心灵气象站**'.length, dressStart).trim();
  if (!/今日心情\s*[：:]/.test(soulSection)) return false;
  const soulTextOnly = soulSection.replace(/今日心情\s*[：:].*/g, '').replace(/\s/g, '');
  if (Array.from(soulTextOnly).length < 55 || Array.from(soulTextOnly).length > 125) return false;

  const dressSection = text.slice(dressStart, dressStart + 1200);
  if (/相位|行运|本命|宫位|星象|合相|冲相|刑相|拱相/.test(dressSection)) return false;

  const labels = ['最佳', '次佳', '平平', '较差', '避免'];
  return labels.every((label) => {
    const labelIndex = dressSection.indexOf(label);
    if (labelIndex < 0) return false;

    const nextLabelIndexes = labels
      .filter(nextLabel => nextLabel !== label)
      .map(nextLabel => dressSection.indexOf(nextLabel, labelIndex + label.length))
      .filter(index => index > labelIndex);
    const nextIndex = nextLabelIndexes.length ? Math.min(...nextLabelIndexes) : dressSection.length;
    const line = dressSection.slice(labelIndex, nextIndex);

    const hasColorEmoji = /[⚫⚪🔴🟠🟡🟢🔵🟣🟤]/.test(line);
    const hasReason = /因为|有助|帮助|适合|带来|稳定|提升|平衡|容易|削弱|不建议|支持|专注|表达|行动|放松|收敛/.test(line);
    return hasColorEmoji && hasReason && line.replace(/\s/g, '').length >= 28;
  });
};

const DAILY_MOOD_OPTIONS = [
  '风轻日暖', '云开月明', '心湖微澜', '暖意回生', '清风入怀', '星河微亮',
  '柔光在心', '晴雨自安', '微光渐起', '慢火温心', '心绪归岸', '花影轻摇',
  '温茶入梦', '月白风清', '暖流暗生', '轻舟过湾', '春水初生', '山月有声',
  '和风细语', '澄明入心', '静云微光', '柔波渐平', '远山含光', '心灯微明',
];

const getDailyMoodPhrase = (birthConfig: BirthData, targetDate: Date, sourceText: string) => {
  const seed = `${birthConfig.year}-${birthConfig.month}-${birthConfig.day}-${birthConfig.hour || 0}-${targetDate.getFullYear()}-${targetDate.getMonth() + 1}-${targetDate.getDate()}-${sourceText.slice(0, 24)}`;
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return DAILY_MOOD_OPTIONS[Math.abs(hash) % DAILY_MOOD_OPTIONS.length];
};

const trimDailySoulText = (value: string, maxLength = 120) => {
  const compact = value.replace(/\s+/g, '');
  if (Array.from(compact).length <= maxLength) return compact;

  const sentences = compact.match(/[^。！？!?]+[。！？!?]?/g) || [];
  let result = '';
  for (const sentence of sentences) {
    if (Array.from(result + sentence).length > maxLength) break;
    result += sentence;
  }
  if (!result) result = Array.from(compact).slice(0, maxLength - 1).join('');
  return /[。！？!?]$/.test(result) ? result : `${result}。`;
};

interface DailySolarTransitFocus {
  promptText: string;
  soulText: string;
  signature: string;
}

const DAILY_SOLAR_ASPECT_TARGETS = new Set(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'ASC', 'MC']);
const DAILY_SOLAR_ASPECT_ORB = 2.5;
const DAILY_LUNAR_ASPECT_ORB = 3;

const HOUSE_SOUL_THEMES: Record<number, { theme: string; action: string }> = {
  1: { theme: '自我状态和身体感', action: '把主动权收回到自己身上' },
  2: { theme: '安全感、金钱和资源', action: '整理真正能支撑你的东西' },
  3: { theme: '沟通、学习和当下安排', action: '把想法说清楚，也把节奏排清楚' },
  4: { theme: '内在安顿和私域生活', action: '先照顾好自己的根基' },
  5: { theme: '表达、创造和被喜欢的感受', action: '允许自己自然发光' },
  6: { theme: '日常秩序、工作流程和身体节奏', action: '从一个可执行的小调整开始' },
  7: { theme: '关系、合作和回应他人', action: '在互动里保留清楚的边界' },
  8: { theme: '信任、边界和深层交换', action: '把没说出口的顾虑温柔摊开' },
  9: { theme: '视野、信念和长期学习', action: '给自己一个更开阔的解释' },
  10: { theme: '事业位置、责任和可见度', action: '把重要的事稳稳拿到台前' },
  11: { theme: '团队、人脉和长期愿景', action: '重新确认你想与谁一起前进' },
  12: { theme: '休息、收尾和内在修复', action: '给能量留一段安静的回流时间' },
};

const HOUSE_SOUL_COPY: Record<number, { focus: string; suggestion: string; emotion: string }> = {
  1: { focus: '今天，你可能更在意自己的状态和节奏。', suggestion: '先照顾好身体感受，再决定要回应什么。', emotion: '情绪上适合把注意力收回自己身上。' },
  2: { focus: '今天适合把注意力放回安全感和实际资源。', suggestion: '整理预算、物品或手边可用的支持，会让心里更踏实。', emotion: '情绪上会更需要稳定和确定感。' },
  3: { focus: '今天很适合阅读、学习和整理信息。', suggestion: '可以试着接触一本想读的书，或把脑子里的想法写下来。', emotion: '情绪上需要轻松交流，不必一个人闷着。' },
  4: { focus: '今天适合把节奏放慢一点，回到让你安心的地方。', suggestion: '收拾房间、好好吃饭，或和熟悉的人说说话，都能帮你稳住心。', emotion: '情绪上会更需要被理解和照顾。' },
  5: { focus: '今天适合做一点让自己开心的事。', suggestion: '创作、表达、运动或安排轻松约会，都能把心里的光重新点起来。', emotion: '情绪上会更想被看见、被喜欢。' },
  6: { focus: '今天适合回到日常秩序和身体节奏。', suggestion: '从一个可执行的小调整开始，把最消耗你的环节先理顺。', emotion: '情绪上会更在意效率和细节。' },
  7: { focus: '今天，关系和合作里的细节会变得更明显。', suggestion: '不必急着迎合别人，把边界说清楚，反而能让互动更舒服。', emotion: '情绪上容易受他人的态度影响。' },
  8: { focus: '今天适合处理那些放在心里很久的感受。', suggestion: '如果有顾虑，不妨慢慢说出来，别让沉默替你做决定。', emotion: '情绪上会更需要信任和安全距离。' },
  9: { focus: '今天适合给自己一点更开阔的视角。', suggestion: '读书、上课、散步或换个环境，都可能帮你把问题看轻一点。', emotion: '情绪上会更渴望新鲜感和方向感。' },
  10: { focus: '今天适合把重要事项稳稳推进。', suggestion: '不必急着证明自己，先把优先级排清楚，再做最关键的一步。', emotion: '情绪上会更在意成果和被认可。' },
  11: { focus: '今天适合和朋友、团队或同频的人保持连接。', suggestion: '把想法说出来，可能会得到比独自琢磨更轻松的回应。', emotion: '情绪上会更需要归属感和交流。' },
  12: { focus: '今天适合给自己留一点安静的时间。', suggestion: '如果觉得累，就先暂停消耗性的安排，让心慢慢回到身体里。', emotion: '情绪上需要休息、整理和独处。' },
};

const SOLAR_ASPECT_TONES: Record<string, string> = {
  合相: '被放大',
  对分相: '被外界照见',
  四分相: '带来一点张力',
  三分相: '流动得更顺',
  六分相: '出现轻巧助力',
};

const NATAL_POINT_SOUL_THEMES: Record<string, string> = {
  Sun: '自我确认',
  Moon: '情绪安全感',
  Mercury: '思路和表达',
  Venus: '关系里的柔软感',
  Mars: '行动冲劲',
  Jupiter: '信心和扩张感',
  Saturn: '责任与边界',
  ASC: '自我呈现',
  MC: '事业可见度',
};

const POINT_SOUL_COPY: Record<string, string> = {
  Sun: '你会更想确认自己的选择是否真的适合自己',
  Moon: '细微情绪容易被放大',
  Mercury: '脑子里会冒出很多想法',
  Venus: '关系里的好恶会更清楚',
  Mars: '行动欲会上来，也容易有点急',
  Jupiter: '信心会被点亮，适合给自己一点鼓励',
  Saturn: '责任感会提醒你放慢一点',
  ASC: '你会更在意自己给人的感觉',
  MC: '你会更在意成果和被看见',
};

const buildDailySoulText = (
  house: number,
  closestAspect: { targetName: string } | undefined,
  moonHouse: number | undefined,
  closestMoonAspect: { targetName: string } | undefined,
) => {
  const mainCopy = HOUSE_SOUL_COPY[house] || HOUSE_SOUL_COPY[6];
  const moonCopy = moonHouse ? HOUSE_SOUL_COPY[moonHouse] || HOUSE_SOUL_COPY[6] : undefined;
  const mainTrigger = closestAspect ? POINT_SOUL_COPY[closestAspect.targetName] : '';
  const moonTrigger = closestMoonAspect ? POINT_SOUL_COPY[closestMoonAspect.targetName] : '';
  const emotionText = moonTrigger || moonCopy?.emotion || '情绪上适合给自己一点缓冲';
  const triggerText = mainTrigger ? `${mainTrigger}，` : '';

  return trimDailySoulText(`${mainCopy.focus}${triggerText}${mainCopy.suggestion}${emotionText}，不用急着把所有感受立刻处理完。`);
};

const getDailySolarTransitFocus = (
  transits: { name: string; lon: number }[],
  natalData: NatalData,
): DailySolarTransitFocus => {
  const transitSun = transits.find(point => point.name === 'Sun');
  const transitMoon = transits.find(point => point.name === 'Moon');
  const fallbackTheme = HOUSE_SOUL_THEMES[6];
  if (!transitSun) {
    return {
      promptText: '今日心灵气象确定性依据：未取得行运太阳位置，请以日常秩序与身体节奏作为主背景；如果有行运月亮，则只作为情绪补充。',
      soulText: `今天适合回到${fallbackTheme.theme}，${fallbackTheme.action}。先把最消耗你的环节放慢一点，心里的空间会跟着变清楚。`,
      signature: 'solar-missing',
    };
  }

  const house = getHouseNumber(transitSun.lon, natalData) || 6;
  const houseTheme = HOUSE_SOUL_THEMES[house] || fallbackTheme;
  const natalPoints = getNatalPoints(natalData).filter(point => DAILY_SOLAR_ASPECT_TARGETS.has(point.name));
  const getClosestAspect = (sourceLon: number, maxOrb: number) => {
    const aspectHits: { label: string; targetName: string; orb: number; tone: string; targetTheme: string }[] = [];

    natalPoints.forEach(target => {
      const distance = getAngularDistance(sourceLon, target.lon);
      ASPECT_CONFIG.forEach(aspect => {
        const orb = Math.abs(distance - aspect.angle);
        if (orb <= Math.min(aspect.orb, maxOrb)) {
          aspectHits.push({
            label: aspect.labelCN,
            targetName: target.name,
            orb,
            tone: SOLAR_ASPECT_TONES[aspect.labelCN] || '被触发',
            targetTheme: NATAL_POINT_SOUL_THEMES[target.name] || getPointLabel(target.name),
          });
        }
      });
    });

    return aspectHits.sort((a, b) => a.orb - b.orb)[0];
  };

  const closestAspect = getClosestAspect(transitSun.lon, DAILY_SOLAR_ASPECT_ORB);
  const moonHouse = transitMoon ? getHouseNumber(transitMoon.lon, natalData) || 6 : undefined;
  const moonHouseTheme = moonHouse ? HOUSE_SOUL_THEMES[moonHouse] || fallbackTheme : undefined;
  const closestMoonAspect = transitMoon ? getClosestAspect(transitMoon.lon, DAILY_LUNAR_ASPECT_ORB) : undefined;
  const aspectPrompt = closestAspect
    ? `- 今日触发：行运太阳 ${closestAspect.label} 本命${getPointLabel(closestAspect.targetName)}（容许度 ${closestAspect.orb.toFixed(2)}°），心理主题：${closestAspect.targetTheme}${closestAspect.tone}。`
    : '- 今日触发：行运太阳与本命重点点位无2.5°内主要相位，心灵气象站只写太阳落宫主背景，不补造相位。';
  const moonPrompt = transitMoon && moonHouseTheme
    ? `- 情绪气象（30%）：行运月亮 ${formatDegree(transitMoon.lon)}，落本命第${moonHouse}宫，主题为「${moonHouseTheme.theme}」。${closestMoonAspect ? `月亮 ${closestMoonAspect.label} 本命${getPointLabel(closestMoonAspect.targetName)}（容许度 ${closestMoonAspect.orb.toFixed(2)}°），作为今日情绪补充。` : '月亮无3°内主要相位，只用落宫做情绪补充。'}`
    : '- 情绪气象（30%）：未取得行运月亮位置，只使用太阳主背景。';
  const displaySoul = buildDailySoulText(house, closestAspect, moonHouse, closestMoonAspect);

  return {
    promptText: `今日心灵气象确定性依据：\n- 权重：行运太阳占70%，行运月亮占30%。\n- 主背景（70%）：行运太阳 ${formatDegree(transitSun.lon)}，落本命第${house}宫，主题为「${houseTheme.theme}」。\n${aspectPrompt}\n${moonPrompt}\n- 输出要求：心灵气象站必须以太阳主背景为主，月亮只作为情绪气象补充；但最终正文必须改写成生活化建议，禁止出现太阳、月亮、行运、本命、宫位、相位、星象、合相、冲相、刑相、拱相、六分相等占星术语。`,
    soulText: displaySoul,
    signature: `sun-${house}-${closestAspect ? `${closestAspect.targetName}-${closestAspect.label}-${closestAspect.orb.toFixed(2)}` : 'no-aspect'}-moon-${moonHouse || 'missing'}-${closestMoonAspect ? `${closestMoonAspect.targetName}-${closestMoonAspect.label}-${closestMoonAspect.orb.toFixed(2)}` : 'no-aspect'}`,
  };
};

const normalizeDailyWorkReport = (
  text: string,
  birthConfig: BirthData,
  targetDate: Date,
  solarTransitFocus?: DailySolarTransitFocus,
) => {
  let normalized = text.trim();
  const soulIndex = normalized.indexOf('**心灵气象站**');
  if (soulIndex > 0) normalized = normalized.substring(soulIndex).trim();
  const moodPhrase = getDailyMoodPhrase(birthConfig, targetDate, `${solarTransitFocus?.signature || ''}${normalized}`);

  normalized = normalized
    .replace(/🟥/g, '🔴')
    .replace(/🟧/g, '🟠')
    .replace(/🟨/g, '🟡')
    .replace(/🟩/g, '🟢')
    .replace(/🟦/g, '🔵')
    .replace(/🟪/g, '🟣')
    .replace(/🟫/g, '🟤')
    .replace(/⬛/g, '⚫')
    .replace(/⬜/g, '⚪')
    .replace(/今日心情\s*[：:]/g, '今日心情：')
    .replace(/([^\n])\s*(今日心情：)/, '$1\n$2');

  normalized = normalized
    .replace(/([：、])⚫/g, '$1黑色 ⚫')
    .replace(/([：、])⚪/g, '$1白色 ⚪')
    .replace(/([：、])🔴/g, '$1红色 🔴')
    .replace(/([：、])🟠/g, '$1橙色 🟠')
    .replace(/([：、])🟡/g, '$1黄色 🟡')
    .replace(/([：、])🟢/g, '$1绿色 🟢')
    .replace(/([：、])🔵/g, '$1蓝色 🔵')
    .replace(/([：、])🟣/g, '$1紫色 🟣')
    .replace(/([：、])🟤/g, '$1棕色 🟤');

  const dressTitlePattern = /(^|\n)\s*(?:#{1,3}\s*)?\*{0,2}穿衣指南\*{0,2}\s*(?=\n|$)/;
  if (dressTitlePattern.test(normalized)) {
    normalized = normalized.replace(dressTitlePattern, '\n\n**穿衣指南**\n');
  } else {
    const dressLabelMatch = normalized.match(/(^|\n)\s*[-▸*]?\s*\*\*(最佳|次佳|平平|较差|避免)\*\*/);
    if (dressLabelMatch?.index !== undefined) {
      const insertIndex = dressLabelMatch.index + (dressLabelMatch[1] === '\n' ? 1 : 0);
      normalized = `${normalized.slice(0, insertIndex).trimEnd()}\n\n**穿衣指南**\n${normalized.slice(insertIndex).trimStart()}`;
    }
  }

  normalized = normalized
    .replace(/(?:\*\*穿衣指南\*\*\s*\n\s*){2,}/g, '**穿衣指南**\n')
    .replace(/\*\*穿衣指南\*\*\s*\n\s*穿衣指南\s*\n/g, '**穿衣指南**\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const soulTitle = '**心灵气象站**';
  const dressTitle = '**穿衣指南**';
  const currentSoulIndex = normalized.indexOf(soulTitle);
  const currentDressIndex = normalized.indexOf(dressTitle);
  if (currentSoulIndex >= 0 && currentDressIndex > currentSoulIndex) {
    const beforeSoul = normalized.slice(0, currentSoulIndex + soulTitle.length);
    const soulSection = normalized
      .slice(currentSoulIndex + soulTitle.length, currentDressIndex)
      .replace(/今日心情\s*[：:].*/g, '')
      .trim();
    const trimmedSoul = solarTransitFocus?.soulText || trimDailySoulText(soulSection);
    const afterDress = normalized.slice(currentDressIndex);
    normalized = `${beforeSoul}\n${trimmedSoul}\n今日心情：${moodPhrase}\n\n${afterDress}`;
  }

  return normalized;
};

export const generateDailyWorkReport = async (
  userNatalData: NatalData,
  userBirthConfig: BirthData,
  includeAstrologyTerms: boolean,
  targetDate: Date = new Date()
): Promise<string> => {
  const cacheKey = getDailyWorkReportCacheKey(userBirthConfig, includeAstrologyTerms, targetDate);

  const cached = mpStorage.getItem(cacheKey);
  if (cached) return cached;

  const transits = await fetchOverlayPlanets(userNatalData.jd, targetDate, ViewMode.TRANSIT, userNatalData, userBirthConfig);
  const solarTransitFocus = getDailySolarTransitFocus(transits, userNatalData);
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const natalSnapshotStr = getNatalSnapshotText(userNatalData);
  const transitSnapshotStr = getOverlaySnapshotText('当前行运盘', transits, userNatalData);
  const dressGuideFormatInstruction = `
【穿衣指南格式硬性要求】
穿衣指南必须固定输出5档，每档最多2行，只包含「颜色 + 圆形emoji」和「一句功能说明」。不得输出“理由：”、场景、提醒、替代建议，也不要写成长段落。
颜色说明只写功能感受，例如稳定情绪、提升专注、增强表达、收敛冲动、放松压力；不得解释来自什么相位、行运、本命、宫位或星象影响。
请严格使用以下格式：
- **最佳**：颜色1 emoji、颜色2 emoji
  一句话说明今天支持什么状态。
- **次佳**：颜色1 emoji、颜色2 emoji
  一句话说明能补充什么功能。
- **平平**：颜色1 emoji
  一句话说明适合作为中性选择。
- **较差**：颜色1 emoji
  一句话说明可能削弱什么状态。
- **避免**：颜色1 emoji
  一句话说明今天不建议的功能原因。
每一档都必须控制在2行以内，每行不超过30个中文字。`;

  const prompt = `
作为一名专业的商业占星顾问，请根据以下用户的本命星盘数据以及当天的行运星象，生成一份「每日运程」。
${getLangInstruction(includeAstrologyTerms)}
请注意：
1. 语言风格专业、实用、有洞察力。
2. 只允许输出以下两个小节，并请严格按照以下顺序排版：
  - **心灵气象站**：必须以「今日心灵气象确定性依据」为核心，暗中按主线70%、情绪30%组织，但最终正文只能写成自然、温柔、生活化的建议，参考「今天适合阅读、交流、放慢决策、整理节奏」这类口吻。正文控制在120个中文字内，不要硬拆成短句清单，不要像命令。段落后另起一行输出「今日心情：四字短语」，四字短语必须根据当天内容变化，不要固定使用同一个词。正文禁止出现太阳、月亮、行运、本命、宫位、相位、星象、合相、冲相、刑相、拱相、六分相等占星术语。
  - **穿衣指南**：颜色上方必须显示这个标题。参考五行穿衣和当天能量，给出穿衣建议。必须明确分为5档：最佳、次佳、平平、较差、避免。对于提到的所有颜色，请务必在颜色名称后面加上对应颜色的圆形emoji；每一档都必须有一句功能说明，不得只列颜色。
3. 务必严格基于下方已计算的当前行运盘星体度数、落本命宫位与相位触发清单进行分析，不得自行补充未列出的相位或事件。
4. 描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。
5. 第一行必须直接是"**心灵气象站**"，不要输出任何问候语或开场白。
6. 禁止输出「今日运势分析」、编号分析、额外标题、场景、提醒、替代建议或结尾总结。
7. 穿衣指南的颜色说明不得出现相位、行运、本命、宫位、星象、合相、冲相、刑相、拱相等占星原因，只说明颜色对情绪、专注、表达、行动、放松或稳定的功能。
8. 颜色 emoji 只能使用圆形：⚫⚪🔴🟠🟡🟢🔵🟣🟤，不要使用方块 emoji。

${dressGuideFormatInstruction}

个人出生信息：
${userBirthConfig.name ? `- 姓名：${userBirthConfig.name}` : ''}
- 出生日期：${userBirthConfig.year}年${userBirthConfig.month}月${userBirthConfig.day}日

个人本命盘关键数据：
- 上升星座 (ASC) 黄经：${formatDegree(userNatalData.angles.ASC)}
- 中天 (MC) 黄经：${formatDegree(userNatalData.angles.MC)}
- 行星位置：
${userNatalData.planets.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

本命盘确定性计算结果：
${natalSnapshotStr}

当前（${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月${targetDate.getDate()}日）行运盘（Transit）关键数据：
${transitDataStr}

${transitSnapshotStr}

${solarTransitFocus.promptText}

请直接输出报告内容，使用Markdown格式。
`;

  const sysInst = getNoTermsSystemInst(includeAstrologyTerms, "你只输出分析的正文，第一行必须直接是'**心灵气象站**'。");
  let text = normalizeDailyWorkReport(await callGemini({ prompt, systemInstruction: sysInst, temperature: 0.2, provider: DAILY_AI_PROVIDER, task: 'daily' }), userBirthConfig, targetDate, solarTransitFocus);

  if (!hasCompleteDailyDressGuide(text)) {
    text = normalizeDailyWorkReport(await callGemini({
      prompt: `${prompt}

【重新生成要求】
上一次输出不符合要求。请重新输出整份报告：只允许「心灵气象站」和「穿衣指南」两个小节；心灵气象站必须依据上方「今日心灵气象确定性依据」，暗中按主线70%、情绪30%组织，标题后写一段自然生活化建议，手机上约5行，不要硬拆短句，段落后必须有「今日心情：四字短语」；心灵气象站正文禁止出现太阳、月亮、行运、本命、宫位、相位或星象；穿衣指南5档每一档都有颜色、圆形emoji和一句功能说明；颜色说明不得提相位、行运、本命、宫位或星象；不得输出“理由：”、今日运势分析、场景、提醒或替代建议。`,
  systemInstruction: getNoTermsSystemInst(includeAstrologyTerms, "你只输出分析的正文，第一行必须直接是'**心灵气象站**'。只允许输出心灵气象站和穿衣指南。心灵气象站要像自然段落，不要短句清单，段落后必须有“今日心情：四字短语”。穿衣指南每一档只写颜色和一句功能说明。颜色说明不得提相位、行运、本命、宫位或星象。禁止输出“理由：”、今日运势分析、场景、提醒或替代建议。"),
      temperature: 0.15,
      provider: DAILY_AI_PROVIDER,
      task: 'daily',
    }), userBirthConfig, targetDate, solarTransitFocus);
  }

  const overviewIndex = text.indexOf('**心灵气象站**');
  if (overviewIndex > 0) text = text.substring(overviewIndex);

  mpStorage.setItem(cacheKey, text);
  return text;
};

export const getDailyWorkReportCacheKey = (
  userBirthConfig: BirthData,
  includeAstrologyTerms: boolean,
  targetDate: Date = new Date()
): string => {
  const dateStr = `${targetDate.getFullYear()}-${targetDate.getMonth() + 1}-${targetDate.getDate()}`;
  return `daily_report_v17_natural_solar_moon_${DAILY_AI_PROVIDER}_${userBirthConfig.year}_${userBirthConfig.month}_${userBirthConfig.day}_${userBirthConfig.hour}_${dateStr}_${includeAstrologyTerms}`;
};

export const getCachedDailyWorkReport = (
  userBirthConfig: BirthData,
  includeAstrologyTerms: boolean,
  targetDate: Date = new Date()
): string | null => mpStorage.getItem(getDailyWorkReportCacheKey(userBirthConfig, includeAstrologyTerms, targetDate));

export const generateDeepAstrologyReport = async (
  userNatalData: NatalData,
  userBirthConfig: BirthData,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const currentDate = new Date();
  const transits = await fetchOverlayPlanets(userNatalData.jd, currentDate, ViewMode.TRANSIT, userNatalData, userBirthConfig);
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const natalSnapshotStr = getNatalSnapshotText(userNatalData);
  const transitSnapshotStr = getOverlaySnapshotText('当前行运盘', transits, userNatalData);

  const prompt = `
作为一名专业的占星师，请根据以下用户的本命星盘数据以及当前的行运星象，生成一份「深度解读」报告。
${getLangInstruction(includeAstrologyTerms)}
${REPORT_LENGTH_INSTRUCTION}
${STRICT_ASTRO_DATA_INSTRUCTION}
请注意：
1. 核心分析内容必须包含：
  - **核心行运相位解读**：精炼分析当前行运行星与本命盘行星形成的重要相位。
   - **近期重要课题**：基于星象，指出用户近期需要面对的核心课题。
   - **能量转化建议**：如何将当前的星象能量转化为积极的行动力。
2. 务必严格基于下方已计算的落宫与相位触发清单进行分析，不得自行补充未列出的星象。
3. 描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。
4. 每个小节 2-4 句，不要输出冗长铺垫。

个人出生信息：
${userBirthConfig.name ? `- 姓名：${userBirthConfig.name}` : ''}
- 出生日期：${userBirthConfig.year}年${userBirthConfig.month}月${userBirthConfig.day}日

本命盘关键数据：
- 上升星座 (ASC) 黄经：${formatDegree(userNatalData.angles.ASC)}
- 中天 (MC) 黄经：${formatDegree(userNatalData.angles.MC)}
- 行星位置：
${userNatalData.planets.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

本命盘确定性计算结果：
${natalSnapshotStr}

当前（${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日）行运盘（Transit）关键数据：
${transitDataStr}

${transitSnapshotStr}

请直接输出报告内容，使用Markdown格式。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const generateCompanySynastryReport = async (
  userNatalData: NatalData,
  userBirthConfig: BirthData,
  companyNatalData: NatalData,
  companyBirthConfig: BirthData,
  companyName: string,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const currentDate = new Date();
  const transits = await fetchOverlayPlanets(companyNatalData.jd, currentDate, ViewMode.TRANSIT, companyNatalData, companyBirthConfig);
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const userSnapshotStr = getNatalSnapshotText(userNatalData);
  const companySnapshotStr = getNatalSnapshotText(companyNatalData);
  const transitSnapshotStr = getOverlaySnapshotText('当前公司行运盘', transits, companyNatalData);

  const prompt = `
作为一名专业的商业占星师，请根据以下创始人（个人）和公司（${companyName}）的本命星盘数据，生成一份深度的【商业合盘与企业战略分析报告】。
${getLangInstruction(includeAstrologyTerms)}
${REPORT_LENGTH_INSTRUCTION}
${STRICT_ASTRO_DATA_INSTRUCTION}
报告必须包含：1.企业天赋使命 2.目标客群深度画像 3.战略重点 4.创始人与企业合盘 5.人才招募建议 6.SWOT分析 7.商业择日建议 8.短中长期战略建议。
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。
所有占星判断必须来自下方已计算的本命/公司盘落宫、相位与公司行运触发清单，不得补造未列出的星象。
每个模块用 2-3 句输出重点，不要展开成完整商业计划书。

创始人出生信息：
${userBirthConfig.name ? `- 姓名：${userBirthConfig.name}` : ''}
- 出生日期：${userBirthConfig.year}年${userBirthConfig.month}月${userBirthConfig.day}日
本命盘：ASC ${formatDegree(userNatalData.angles.ASC)} | MC ${formatDegree(userNatalData.angles.MC)}
${userNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}
创始人盘确定性计算结果：
${userSnapshotStr}

公司（${companyName}）注册日期：${companyBirthConfig.year}年${companyBirthConfig.month}月${companyBirthConfig.day}日
公司星盘：ASC ${formatDegree(companyNatalData.angles.ASC)} | MC ${formatDegree(companyNatalData.angles.MC)}
${companyNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}
公司盘确定性计算结果：
${companySnapshotStr}

当前行运盘（${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日）：
${transitDataStr}
${transitSnapshotStr}

请直接输出报告内容。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const generateCompanyAnnualReport = async (
  companyNatalData: NatalData,
  companyBirthConfig: BirthData,
  companyName: string,
  year: number,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const midYearDate = new Date(Date.UTC(year, 6, 1));
  const [transits, progressions] = await Promise.all([
    fetchOverlayPlanets(companyNatalData.jd, midYearDate, ViewMode.TRANSIT, companyNatalData, companyBirthConfig),
    fetchOverlayPlanets(companyNatalData.jd, midYearDate, ViewMode.PROGRESSION, companyNatalData, companyBirthConfig),
  ]);
  const annualTransitBackground = getAnnualTransitBackgroundPoints(transits);
  const transitDataStr = annualTransitBackground.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const progressionDataStr = progressions.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const companySnapshotStr = getNatalSnapshotText(companyNatalData);
  const transitSnapshotStr = getOverlaySnapshotText(`${year}年7月1日公司慢行星与交点行运背景`, annualTransitBackground, companyNatalData);
  const progressionSnapshotStr = getOverlaySnapshotText(`${year}年7月1日公司次限盘`, progressions, companyNatalData);

  const prompt = `
作为一名专业的商业占星师，请根据以下公司（${companyName}）的本命星盘数据，为他们生成一份 ${year}年 商业年度分析报告。
${getLangInstruction(includeAstrologyTerms)}
${REPORT_LENGTH_INSTRUCTION}
${STRICT_ASTRO_DATA_INSTRUCTION}
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。
所有年度判断必须来自下方已计算的公司盘、行运盘、次限盘落宫与相位触发清单，不得补造未列出的换座、过宫、相位或日月食。
年度行运背景只可使用下方慢行星与交点（木星、土星、天王星、海王星、冥王星、南北交点）；不得把太阳、月亮、水星、金星、火星在某一天的落宫写成全年趋势。
请输出 4-6 个小节，每节 2-4 句，重点放在策略判断和行动建议。

公司（${companyName}）注册日期：${companyBirthConfig.year}年${companyBirthConfig.month}月${companyBirthConfig.day}日
公司星盘：ASC ${formatDegree(companyNatalData.angles.ASC)} | MC ${formatDegree(companyNatalData.angles.MC)}
${companyNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}
公司盘确定性计算结果：
${companySnapshotStr}

${year}年年中慢行星与交点行运背景：
${transitDataStr}
${transitSnapshotStr}

${year}年年中次限盘：
${progressionDataStr}
${progressionSnapshotStr}

请直接输出报告内容，可以使用Markdown格式。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const generateJobHopReport = async (
  userNatalData: NatalData,
  userBirthConfig: BirthData,
  companyNatalData: NatalData,
  companyBirthConfig: BirthData,
  companyName: string,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const currentDate = new Date();
  const transits = await fetchOverlayPlanets(userNatalData.jd, currentDate, ViewMode.TRANSIT, userNatalData, userBirthConfig);
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const userSnapshotStr = getNatalSnapshotText(userNatalData);
  const companySnapshotStr = getNatalSnapshotText(companyNatalData);
  const transitSnapshotStr = getOverlaySnapshotText('当前个人行运盘', transits, userNatalData);

  const prompt = `
作为一名专业的职业规划与商业占星师，请根据以下求职者（个人）和目标公司（${companyName}）的本命星盘数据，生成一份「跳槽吧」深度分析报告。
${getLangInstruction(includeAstrologyTerms)}
${REPORT_LENGTH_INSTRUCTION}
${STRICT_ASTRO_DATA_INSTRUCTION}
报告须包含：契合度分析、入职时机建议、避坑与注意事项。
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。
所有入职时机与风险判断必须来自下方已计算的个人盘、公司盘与个人行运触发清单，不得补造未列出的星象。
每个模块 2-4 句，避免重复描述盘面基础信息。

个人：${userBirthConfig.name || ''}，${userBirthConfig.year}年${userBirthConfig.month}月${userBirthConfig.day}日
本命盘：ASC ${formatDegree(userNatalData.angles.ASC)} | MC ${formatDegree(userNatalData.angles.MC)}
${userNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}
个人盘确定性计算结果：
${userSnapshotStr}

目标公司（${companyName}）注册：${companyBirthConfig.year}年${companyBirthConfig.month}月${companyBirthConfig.day}日
公司星盘：ASC ${formatDegree(companyNatalData.angles.ASC)} | MC ${formatDegree(companyNatalData.angles.MC)}
${companyNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}
公司盘确定性计算结果：
${companySnapshotStr}

当前行运盘（${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日）：
${transitDataStr}
${transitSnapshotStr}

请直接输出报告内容，使用Markdown格式。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const generatePartnerCompatibilityReport = async (
  partners: { name: string; natalData: NatalData; birthConfig: BirthData }[],
  includeAstrologyTerms: boolean
): Promise<string> => {
  const partnersDataStr = partners.map((p, i) => `
合作伙伴 ${i + 1}: ${p.name}
- 出生日期：${p.birthConfig.year}年${p.birthConfig.month}月${p.birthConfig.day}日
- ASC: ${formatDegree(p.natalData.angles.ASC)}, MC: ${formatDegree(p.natalData.angles.MC)}
${p.natalData.planets.map(pl => `- ${pl.name}: ${formatDegree(pl.lon)}`).join('\n')}
确定性计算结果：
${getNatalSnapshotText(p.natalData)}
`).join('\n');

  const prompt = `
作为一名专业的商业占星顾问，请根据以下 ${partners.length} 位合伙人的本命星盘数据，生成一份深度的【商业合伙人合盘分析报告】。
${getLangInstruction(includeAstrologyTerms)}
${REPORT_LENGTH_INSTRUCTION}
${STRICT_ASTRO_DATA_INSTRUCTION}
报告须包含：商业契合度评分、核心愿景与品牌基因、日常分工建议、财富观念与利益分配、压力测试与冲突预演。
商业契合度评分请用普通文本列出5个维度及0-100分，例如「创新与适应性：80分」，并在评分后用1-2句话解释整体结构。严禁输出 JSON、代码块、反引号或任何原始数据格式。
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。
所有合伙判断必须来自下方已计算的各自本命盘落宫与相位清单，不得补造未列出的星象。
每个模块 2-4 句。

${partnersDataStr}

请直接输出报告内容。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const askReportQuestion = async (
  reportContext: string,
  question: string,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const prompt = `
作为一名专业的占星师，请根据以下已生成的占星报告内容，回答用户的问题。
${getLangInstruction(includeAstrologyTerms)}

已生成的报告内容：
${reportContext}

用户的问题是："${question}"

请直接输出回答内容，可以使用Markdown格式。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const askAstrologyQuestion = async (
  natalData: NatalData,
  birthConfig: BirthData,
  question: string,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const prompt = `
作为一名专业的占星师，请根据以下用户的本命星盘数据，回答他们的问题。
${getLangInstruction(includeAstrologyTerms)}
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。
必须严格基于下方已计算的普拉西宫位、落宫与相位清单回答，不得补造未列出的星象。

用户：${birthConfig.name || ''}，${birthConfig.year}年${birthConfig.month}月${birthConfig.day}日，${birthConfig.city || ''}
本命盘：ASC ${formatDegree(natalData.angles.ASC)} | MC ${formatDegree(natalData.angles.MC)}
${natalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}
确定性计算结果：
${getNatalSnapshotText(natalData)}

用户的问题是："${question}"

请直接输出回答内容，可以使用Markdown格式。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const generateAstroDiceReading = async (
  question: string,
  planet: string,
  zodiac: string,
  house: string,
  analysis: { status: string; score: number; houseType: string }
): Promise<string> => {
  const prompt = `你是一位精通《基督占星》（威廉·莉莉体系）的古典卜卦占星师。
用户问题：${question}
掷骰结果：${planet}，${zodiac}，${house}。
本质力量：${planet}在${zodiac}的状态为「${analysis.status}」，力量得分为 ${analysis.score}。
偶然力量：${house}属于「${analysis.houseType}」。
请采用古典占星客观、断事的风格，综合给出明确的「吉凶预判」和精炼的结论（控制在 300 字以内，语气专业、笃定、带古典神祕感）。`;

  return callGemini({ prompt });
};

export const generateDeepAstroDiceReading = async (
  question: string,
  planet: string,
  zodiac: string,
  house: string,
  analysis: { status: string; score: number; houseType: string }
): Promise<string> => {
  const prompt = `你是一位精通《基督占星》（威廉·莉莉体系）的古典卜卦占星师。
用户问题：${question}
掷骰结果：${planet}，${zodiac}，${house}。
本质力量：${planet}在${zodiac}的状态为「${analysis.status}」，力量得分为 ${analysis.score}。
偶然力量：${house}属于「${analysis.houseType}」。
请提供精炼的深度解读报告，包含：核心预判、事件推进、细节剖析、行动建议、最终结论。总长度控制为常规版本约70%，使用Markdown格式，语气专业、笃定、带古典神祕感。`;

  return callGemini({ prompt });
};
