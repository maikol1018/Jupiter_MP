import { NatalData, BirthData, ViewMode } from '../types';
import { fetchOverlayPlanets } from './astroService';
import { ZODIAC_SIGNS } from '../constants';
import { callGemini } from './apiService';

const formatDegree = (lon: number) => {
  const signIndex = Math.floor(lon / 30) % 12;
  const degInSign = lon % 30;
  return `${ZODIAC_SIGNS[signIndex]?.nameCN} ${degInSign.toFixed(2)}°`;
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

// ── 微信小程序 localStorage 替代 ────────────────────────
const mpStorage = {
  getItem: (key: string): string | null => {
    try { return wx.getStorageSync(key) || null; } catch { return null; }
  },
  setItem: (key: string, value: string) => {
    try { wx.setStorageSync(key, value); } catch {}
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
  const transits = await fetchOverlayPlanets(natalData.jd, midYearDate, ViewMode.TRANSIT, natalData, birthConfig);
  const progressions = await fetchOverlayPlanets(natalData.jd, midYearDate, ViewMode.PROGRESSION, natalData, birthConfig);
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const progressionDataStr = progressions.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');

  const prompt = `
作为一名专业的占星师，请根据以下用户的本命星盘数据，为他们生成一份关于"${category}"的 ${year}年 年度分析报告。
${getLangInstruction(includeAstrologyTerms)}
请注意：
1. 语言风格尽量符合年轻人，轻松、有共鸣，但不要浮夸或过度娱乐化。
2. 结合本命盘的主要特征（如太阳、月亮、上升星座，以及主要相位）。
3. 结合 ${year} 年的重要行运星象（Transit，如木星、土星换座，日月食等）对该用户本命盘的影响。
4. 结合 ${year} 年的次限盘（Secondary Progression）重要推运事件（如次限月亮过宫、次限太阳换座、次限行星与本命行星形成重要相位等）。
5. 综合行运盘（Transit）和次限盘（Progression），如果两者在 ${year} 年同时触发了相同的主题或相位（双重强调的事件），请务必重点指出并详细分析其带来的重大影响。
6. 给出实用的建议。
7. 务必严格基于下方提供的行运盘和次限盘星体度数进行分析，切勿自行推演或编造星体位置。
8. 描述星盘宫位时，请统一使用"宫"字，例如"第6宫"、"6宫"，绝对不要使用"室"字（如"6室"）。

用户出生信息：
${birthConfig.name ? `- 姓名：${birthConfig.name}` : ''}
- 出生日期：${birthConfig.year}年${birthConfig.month}月${birthConfig.day}日
- 出生地点：${birthConfig.city}

本命盘关键数据：
- 上升星座 (ASC) 黄经：${formatDegree(natalData.angles.ASC)}
- 中天 (MC) 黄经：${formatDegree(natalData.angles.MC)}
- 行星位置：
${natalData.planets.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

${year}年年中（7月1日）行运盘（Transit）关键数据：
- 行星位置：
${transitDataStr}

${year}年年中（7月1日）次限盘（Progression）关键数据：
- 行星位置：
${progressionDataStr}

请直接输出报告内容，可以使用Markdown格式。
`;

  return callGemini({ prompt, systemInstruction: getNoTermsSystemInst(includeAstrologyTerms) });
};

export const generateDailyWorkReport = async (
  userNatalData: NatalData,
  userBirthConfig: BirthData,
  includeAstrologyTerms: boolean,
  targetDate: Date = new Date()
): Promise<string> => {
  const dateStr = `${targetDate.getFullYear()}-${targetDate.getMonth() + 1}-${targetDate.getDate()}`;
  const cacheKey = `daily_report_v2_${userBirthConfig.year}_${userBirthConfig.month}_${userBirthConfig.day}_${userBirthConfig.hour}_${dateStr}_${includeAstrologyTerms}`;

  const cached = mpStorage.getItem(cacheKey);
  if (cached) return cached;

  const transits = await fetchOverlayPlanets(userNatalData.jd, targetDate, ViewMode.TRANSIT, userNatalData, userBirthConfig);
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');

  const prompt = `
作为一名专业的商业占星顾问，请根据以下用户的本命星盘数据以及当天的行运星象，生成一份「每日运程」。
${getLangInstruction(includeAstrologyTerms)}
请注意：
1. 语言风格专业、实用、有洞察力。
2. 核心分析内容必须包含，且请严格按照以下顺序排版：
   - **运势概览**：给予一个不超过120字的建议。重点给予「内在情绪」或「亲密关系」方面的建议。请暗中运用"行为建议、心理感受、价值升华"的逻辑来撰写，但绝对不要在文本中明写出这些词汇。
   - **穿衣指南**：参考五行穿衣和当天星象，给出穿衣建议。必须明确分为5档：最佳、次佳、平平、较差、避免。对于提到的所有颜色，请务必在颜色名称后面加上对应颜色的圆形emoji。
3. 务必严格基于下方提供的当前行运盘星体度数与本命盘的互动进行分析。
4. 描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。
5. 第一行必须直接是"**运势概览**"，不要输出任何问候语或开场白。

个人出生信息：
${userBirthConfig.name ? `- 姓名：${userBirthConfig.name}` : ''}
- 出生日期：${userBirthConfig.year}年${userBirthConfig.month}月${userBirthConfig.day}日

个人本命盘关键数据：
- 上升星座 (ASC) 黄经：${formatDegree(userNatalData.angles.ASC)}
- 中天 (MC) 黄经：${formatDegree(userNatalData.angles.MC)}
- 行星位置：
${userNatalData.planets.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

当前（${targetDate.getFullYear()}年${targetDate.getMonth() + 1}月${targetDate.getDate()}日）行运盘（Transit）关键数据：
${transitDataStr}

请直接输出报告内容，使用Markdown格式。
`;

  const sysInst = getNoTermsSystemInst(includeAstrologyTerms, "你只输出运势分析的正文，第一行必须直接是'**运势概览**'。");
  let text = await callGemini({ prompt, systemInstruction: sysInst, temperature: 0.2 });

  const overviewIndex = text.indexOf('**运势概览**');
  if (overviewIndex > 0) text = text.substring(overviewIndex);

  mpStorage.setItem(cacheKey, text);
  return text;
};

export const generateDeepAstrologyReport = async (
  userNatalData: NatalData,
  userBirthConfig: BirthData,
  includeAstrologyTerms: boolean
): Promise<string> => {
  const currentDate = new Date();
  const transits = await fetchOverlayPlanets(userNatalData.jd, currentDate, ViewMode.TRANSIT, userNatalData, userBirthConfig);
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');

  const prompt = `
作为一名专业的占星师，请根据以下用户的本命星盘数据以及当前的行运星象，生成一份「深度星象解读」报告。
${getLangInstruction(includeAstrologyTerms)}
请注意：
1. 核心分析内容必须包含：
   - **核心行运相位解读**：详细分析当前行运行星与本命盘行星形成的重要相位。
   - **近期重要课题**：基于星象，指出用户近期需要面对的核心课题。
   - **能量转化建议**：如何将当前的星象能量转化为积极的行动力。
2. 务必严格基于下方数据进行分析。
3. 描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。

个人出生信息：
${userBirthConfig.name ? `- 姓名：${userBirthConfig.name}` : ''}
- 出生日期：${userBirthConfig.year}年${userBirthConfig.month}月${userBirthConfig.day}日

本命盘关键数据：
- 上升星座 (ASC) 黄经：${formatDegree(userNatalData.angles.ASC)}
- 中天 (MC) 黄经：${formatDegree(userNatalData.angles.MC)}
- 行星位置：
${userNatalData.planets.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

当前（${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日）行运盘（Transit）关键数据：
${transitDataStr}

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

  const prompt = `
作为一名专业的商业占星师，请根据以下创始人（个人）和公司（${companyName}）的本命星盘数据，生成一份深度的【商业合盘与企业战略分析报告】。
${getLangInstruction(includeAstrologyTerms)}
报告必须包含：1.企业天赋使命 2.目标客群深度画像 3.战略重点 4.创始人与企业合盘 5.人才招募建议 6.SWOT分析 7.商业择日建议 8.短中长期战略建议。
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。

创始人出生信息：
${userBirthConfig.name ? `- 姓名：${userBirthConfig.name}` : ''}
- 出生日期：${userBirthConfig.year}年${userBirthConfig.month}月${userBirthConfig.day}日
本命盘：ASC ${formatDegree(userNatalData.angles.ASC)} | MC ${formatDegree(userNatalData.angles.MC)}
${userNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

公司（${companyName}）注册日期：${companyBirthConfig.year}年${companyBirthConfig.month}月${companyBirthConfig.day}日
公司星盘：ASC ${formatDegree(companyNatalData.angles.ASC)} | MC ${formatDegree(companyNatalData.angles.MC)}
${companyNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

当前行运盘（${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日）：
${transitDataStr}

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
  const transits = await fetchOverlayPlanets(companyNatalData.jd, midYearDate, ViewMode.TRANSIT, companyNatalData, companyBirthConfig);
  const progressions = await fetchOverlayPlanets(companyNatalData.jd, midYearDate, ViewMode.PROGRESSION, companyNatalData, companyBirthConfig);
  const transitDataStr = transits.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');
  const progressionDataStr = progressions.map(p => `  - ${p.name}: ${formatDegree(p.lon)}`).join('\n');

  const prompt = `
作为一名专业的商业占星师，请根据以下公司（${companyName}）的本命星盘数据，为他们生成一份 ${year}年 商业年度分析报告。
${getLangInstruction(includeAstrologyTerms)}
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。

公司（${companyName}）注册日期：${companyBirthConfig.year}年${companyBirthConfig.month}月${companyBirthConfig.day}日
公司星盘：ASC ${formatDegree(companyNatalData.angles.ASC)} | MC ${formatDegree(companyNatalData.angles.MC)}
${companyNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

${year}年年中行运盘：
${transitDataStr}

${year}年年中次限盘：
${progressionDataStr}

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

  const prompt = `
作为一名专业的职业规划与商业占星师，请根据以下求职者（个人）和目标公司（${companyName}）的本命星盘数据，生成一份「跳槽吧」深度分析报告。
${getLangInstruction(includeAstrologyTerms)}
报告须包含：契合度分析、入职时机建议、避坑与注意事项。
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。

个人：${userBirthConfig.name || ''}，${userBirthConfig.year}年${userBirthConfig.month}月${userBirthConfig.day}日
本命盘：ASC ${formatDegree(userNatalData.angles.ASC)} | MC ${formatDegree(userNatalData.angles.MC)}
${userNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

目标公司（${companyName}）注册：${companyBirthConfig.year}年${companyBirthConfig.month}月${companyBirthConfig.day}日
公司星盘：ASC ${formatDegree(companyNatalData.angles.ASC)} | MC ${formatDegree(companyNatalData.angles.MC)}
${companyNatalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

当前行运盘（${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日）：
${transitDataStr}

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
`).join('\n');

  const prompt = `
作为一名专业的商业占星顾问，请根据以下 ${partners.length} 位合伙人的本命星盘数据，生成一份深度的【商业合伙人合盘分析报告】。
${getLangInstruction(includeAstrologyTerms)}
报告须包含：商业契合度雷达图数据（JSON格式，5个维度0-100评分）、核心愿景与品牌基因、日常分工建议、财富观念与利益分配、压力测试与冲突预演。
描述星盘宫位时，请统一使用"宫"字，绝对不要使用"室"字。

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

用户：${birthConfig.name || ''}，${birthConfig.year}年${birthConfig.month}月${birthConfig.day}日，${birthConfig.city || ''}
本命盘：ASC ${formatDegree(natalData.angles.ASC)} | MC ${formatDegree(natalData.angles.MC)}
${natalData.planets.map(p => `- ${p.name}: ${formatDegree(p.lon)}`).join('\n')}

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
请提供详尽的深度解读报告，包含：核心预判、事件推进、细节剖析、行动建议、最终结论。使用Markdown格式，语气专业、笃定、带古典神祕感。`;

  return callGemini({ prompt });
};
