import { View, Text, Button, Input, Textarea, Picker, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { BirthData, NatalData } from '../../types';
import { fetchNatalChart } from '../../services/astroService';
import {
  generateCompanySynastryReport,
  generateCompanyAnnualReport,
  generateJobHopReport,
  generatePartnerCompatibilityReport,
  generateAstroDiceReading,
  generateDeepAstroDiceReading,
} from '../../services/geminiService';
import './index.scss';

// ── Markdown 渲染 ──────────────────────────────
function renderMarkdown(text: string) {
  if (!text) return [];
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const isH1 = line.startsWith('# ');
    const isH2 = line.startsWith('## ');
    const isH3 = line.startsWith('### ');
    const isBullet = line.startsWith('- ') || line.startsWith('▸ ');
    const cleanLine = line.replace(/^#{1,3}\s/, '').replace(/^[-▸]\s/, '');
    if (!line.trim()) return <View key={i} className="md-spacer" />;
    if (isH1) return <View key={i} className="md-h1"><Text>{cleanLine}</Text></View>;
    if (isH2) return <View key={i} className="md-h2"><Text>{cleanLine}</Text></View>;
    if (isH3) return <View key={i} className="md-h3"><Text className="md-h3-bullet">◆ </Text><Text>{cleanLine}</Text></View>;
    if (isBullet) return <View key={i} className="md-bullet"><Text className="md-bullet-dot">▸ </Text><Text className="md-bullet-text">{cleanLine}</Text></View>;
    return (
      <View key={i} className="md-p">
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) return <Text key={j} className="md-bold">{part.slice(2, -2)}</Text>;
          return <Text key={j}>{part}</Text>;
        })}
      </View>
    );
  });
}

// ── AstroDice 数据 ──────────────────────────────
const planets = ["太阳","月亮","水星","金星","火星","木星","土星","天王星","海王星","冥王星","北交点","南交点"];
const zodiacs = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const houses = ["第1宫","第2宫","第3宫","第4宫","第5宫","第6宫","第7宫","第8宫","第9宫","第10宫","第11宫","第12宫"];

const classicalDignities: Record<string, { domicile: string[]; exaltation: string[]; detriment: string[]; fall: string[] }> = {
  "太阳": { domicile: ["狮子座"], exaltation: ["白羊座"], detriment: ["水瓶座"], fall: ["天秤座"] },
  "月亮": { domicile: ["巨蟹座"], exaltation: ["金牛座"], detriment: ["摩羯座"], fall: ["天蝎座"] },
  "水星": { domicile: ["双子座","处女座"], exaltation: ["处女座"], detriment: ["射手座","双鱼座"], fall: ["双鱼座"] },
  "金星": { domicile: ["金牛座","天秤座"], exaltation: ["双鱼座"], detriment: ["天蝎座","白羊座"], fall: ["处女座"] },
  "火星": { domicile: ["白羊座","天蝎座"], exaltation: ["摩羯座"], detriment: ["天秤座","金牛座"], fall: ["巨蟹座"] },
  "木星": { domicile: ["射手座","双鱼座"], exaltation: ["巨蟹座"], detriment: ["双子座","处女座"], fall: ["摩羯座"] },
  "土星": { domicile: ["摩羯座","水瓶座"], exaltation: ["天秤座"], detriment: ["巨蟹座","狮子座"], fall: ["白羊座"] },
};

function calculateDignity(planet: string, zodiac: string, house: string) {
  let status = "中性 (Peregrine)"; let score = 0;
  const d = classicalDignities[planet];
  if (d) {
    if (d.domicile.includes(zodiac)) { status = "入庙 (Domicile) - 状态极佳"; score = 5; }
    else if (d.exaltation.includes(zodiac)) { status = "旺 (Exaltation) - 力量强大"; score = 4; }
    else if (d.fall.includes(zodiac)) { status = "落 (Fall) - 力量减弱"; score = -4; }
    else if (d.detriment.includes(zodiac)) { status = "陷 (Detriment) - 状态最弱"; score = -5; }
  }
  const angular = ["第1宫","第4宫","第7宫","第10宫"];
  const succedent = ["第2宫","第5宫","第8宫","第11宫"];
  let houseType = "果宫 (Cadent) - 力量最弱";
  if (angular.includes(house)) houseType = "角宫 (Angular) - 力量最强";
  else if (succedent.includes(house)) houseType = "续宫 (Succedent) - 力量适中";
  return { status, score, houseType };
}

// ── 年份/月份/日期/时/分 选择范围 ────────────────
const currentYear = new Date().getFullYear();
const yearRange = Array.from({ length: 100 }, (_, i) => currentYear - i);
const monthRange = Array.from({ length: 12 }, (_, i) => i + 1);
const dayRange = Array.from({ length: 31 }, (_, i) => i + 1);
const hourRange = Array.from({ length: 24 }, (_, i) => i);
const minuteRange = Array.from({ length: 60 }, (_, i) => i);

// ── 公司/跳槽 输入表单组件 ──────────────────────
function CompanyForm({ title, subtitle, storageKey, buttonText, onSubmit, loading }: {
  title: string; subtitle: string; storageKey: string; buttonText: string;
  onSubmit: (bd: BirthData, name: string) => void; loading: boolean;
}) {
  const [name, setName] = useState('');
  const [year, setYear] = useState(2020);
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [city, setCity] = useState('Taipei');
  const [lat, setLat] = useState(25.033);
  const [lon, setLon] = useState(121.565);

  useLoad(() => {
    try {
      const saved = Taro.getStorageSync(storageKey);
      if (saved) {
        if (saved.companyName) setName(saved.companyName);
        if (saved.date) { setYear(saved.date.year); setMonth(saved.date.month); setDay(saved.date.day); }
        if (saved.time) { setHour(saved.time.hour); setMinute(saved.time.minute); }
        if (saved.location) { setCity(saved.location.name); setLat(saved.location.lat); setLon(saved.location.lon); }
      }
    } catch {}
  });

  const handleSubmit = () => {
    if (!name.trim()) { Taro.showToast({ title: '请输入名称', icon: 'none' }); return; }
    Taro.setStorageSync(storageKey, { companyName: name, date: { year, month, day }, time: { hour, minute }, location: { name: city, lat, lon } });
    onSubmit({ year, month, day, hour: hour + minute / 60, minute, lat, lon, city }, name);
  };

  return (
    <View className="form-container">
      <Text className="form-title">{title}</Text>
      <Text className="form-subtitle">{subtitle}</Text>

      <View className="form-group">
        <Text className="form-label">名称</Text>
        <Input className="form-input" value={name} onInput={e => setName(e.detail.value)} placeholder="例如：Apple Inc." />
      </View>

      <View className="form-group">
        <Text className="form-label">注册日期</Text>
        <View className="form-row-3">
          <Picker mode="selector" range={yearRange} value={yearRange.indexOf(year)} onChange={e => setYear(yearRange[Number(e.detail.value)])}>
            <View className="form-input picker-input">{year}年</View>
          </Picker>
          <Picker mode="selector" range={monthRange} value={month - 1} onChange={e => setMonth(Number(e.detail.value) + 1)}>
            <View className="form-input picker-input">{month}月</View>
          </Picker>
          <Picker mode="selector" range={dayRange} value={day - 1} onChange={e => setDay(Number(e.detail.value) + 1)}>
            <View className="form-input picker-input">{day}日</View>
          </Picker>
        </View>
      </View>

      <View className="form-group">
        <Text className="form-label">注册时间</Text>
        <View className="form-row-2">
          <Picker mode="selector" range={hourRange} value={hour} onChange={e => setHour(Number(e.detail.value))}>
            <View className="form-input picker-input">{String(hour).padStart(2, '0')}时</View>
          </Picker>
          <Picker mode="selector" range={minuteRange} value={minute} onChange={e => setMinute(Number(e.detail.value))}>
            <View className="form-input picker-input">{String(minute).padStart(2, '0')}分</View>
          </Picker>
        </View>
      </View>

      <View className="form-group">
        <Text className="form-label">注册地点</Text>
        <Input className="form-input" value={city} onInput={e => setCity(e.detail.value)} placeholder="城市名 (如 Taipei)" />
      </View>

      <Button className="submit-btn" loading={loading} disabled={loading} onClick={handleSubmit}>
        {loading ? '生成报告中...' : buttonText}
      </Button>
    </View>
  );
}

// ── 合伙人输入表单 ──────────────────────────────
function PartnerForm({ onSubmit, loading }: { onSubmit: (partners: { name: string; birthData: BirthData }[]) => void; loading: boolean }) {
  const [partnerList, setPartnerList] = useState<{ id: string; name: string; year: number; month: number; day: number; hour: number; minute: number; city: string; lat: number; lon: number }[]>([
    { id: '1', name: '', year: 2000, month: 1, day: 1, hour: 12, minute: 0, city: '', lat: 0, lon: 0 }
  ]);

  const addPartner = () => {
    if (partnerList.length < 4) {
      setPartnerList([...partnerList, { id: Date.now().toString(), name: '', year: 2000, month: 1, day: 1, hour: 12, minute: 0, city: '', lat: 0, lon: 0 }]);
    }
  };

  const removePartner = (id: string) => {
    if (partnerList.length > 1) setPartnerList(partnerList.filter(p => p.id !== id));
  };

  const updateField = (id: string, field: string, value: any) => {
    setPartnerList(partnerList.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleSubmit = () => {
    const valid = partnerList.filter(p => p.name.trim());
    if (valid.length < 1) { Taro.showToast({ title: '请至少填写一位合伙人', icon: 'none' }); return; }
    onSubmit(valid.map(p => ({
      name: p.name,
      birthData: { year: p.year, month: p.month, day: p.day, hour: p.hour + p.minute / 60, minute: p.minute, lat: p.lat, lon: p.lon, city: p.city }
    })));
  };

  return (
    <View className="form-container">
      <Text className="form-title">🤝 合伙避坑指南</Text>
      <Text className="form-subtitle">最多支持4位合伙人</Text>

      {partnerList.map((p, idx) => (
        <View key={p.id} className="partner-card">
          <View className="partner-header">
            <Text className="partner-title">合伙人 {idx + 1}</Text>
            {partnerList.length > 1 && <Text className="partner-remove" onClick={() => removePartner(p.id)}>删除</Text>}
          </View>
          <Input className="form-input" value={p.name} onInput={e => updateField(p.id, 'name', e.detail.value)} placeholder="姓名" />
          <View className="form-row-3" style={{ marginTop: '16rpx' }}>
            <Picker mode="selector" range={yearRange} value={yearRange.indexOf(p.year)} onChange={e => updateField(p.id, 'year', yearRange[Number(e.detail.value)])}>
              <View className="form-input picker-input">{p.year}年</View>
            </Picker>
            <Picker mode="selector" range={monthRange} value={p.month - 1} onChange={e => updateField(p.id, 'month', Number(e.detail.value) + 1)}>
              <View className="form-input picker-input">{p.month}月</View>
            </Picker>
            <Picker mode="selector" range={dayRange} value={p.day - 1} onChange={e => updateField(p.id, 'day', Number(e.detail.value) + 1)}>
              <View className="form-input picker-input">{p.day}日</View>
            </Picker>
          </View>
          <View className="form-row-2" style={{ marginTop: '16rpx' }}>
            <Picker mode="selector" range={hourRange} value={p.hour} onChange={e => updateField(p.id, 'hour', Number(e.detail.value))}>
              <View className="form-input picker-input">{String(p.hour).padStart(2, '0')}时</View>
            </Picker>
            <Picker mode="selector" range={minuteRange} value={p.minute} onChange={e => updateField(p.id, 'minute', Number(e.detail.value))}>
              <View className="form-input picker-input">{String(p.minute).padStart(2, '0')}分</View>
            </Picker>
          </View>
          <Input className="form-input" style={{ marginTop: '16rpx' }} value={p.city} onInput={e => updateField(p.id, 'city', e.detail.value)} placeholder="出生城市" />
        </View>
      ))}

      {partnerList.length < 4 && (
        <Button className="add-partner-btn" onClick={addPartner}>+ 添加合伙人</Button>
      )}
      <Button className="submit-btn" loading={loading} disabled={loading} onClick={handleSubmit}>
        {loading ? '生成报告中...' : '生成合盘报告'}
      </Button>
    </View>
  );
}

// ── 求一卦组件 ──────────────────────────────────
function DicePanel() {
  const [question, setQuestion] = useState('');
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<{ planet: string; zodiac: string; house: string } | null>(null);
  const [analysis, setAnalysis] = useState<{ status: string; score: number; houseType: string } | null>(null);
  const [reading, setReading] = useState('');
  const [deepReading, setDeepReading] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  const getAsked = (): string[] => { try { return Taro.getStorageSync('astrodice_asked') || []; } catch { return []; } };

  const roll = async () => {
    if (!question.trim()) { Taro.showToast({ title: '请先输入问题', icon: 'none' }); return; }
    const asked = getAsked();
    if (asked.includes(question.trim().toLowerCase())) {
      Taro.showToast({ title: '同一个问题只能问一次', icon: 'none', duration: 2500 }); return;
    }
    setRolling(true); setResult(null); setAnalysis(null); setReading(''); setDeepReading(''); setError('');
    await new Promise(r => setTimeout(r, 800));
    const p = planets[Math.floor(Math.random() * planets.length)];
    const z = zodiacs[Math.floor(Math.random() * zodiacs.length)];
    const h = houses[Math.floor(Math.random() * houses.length)];
    const a = calculateDignity(p, z, h);
    setResult({ planet: p, zodiac: z, house: h }); setAnalysis(a);
    try {
      const r = await generateAstroDiceReading(question, p, z, h, a);
      setReading(r);
      asked.push(question.trim().toLowerCase());
      Taro.setStorageSync('astrodice_asked', asked);
    } catch (e: any) { setError('AI 解读失败: ' + (e.message || '')); }
    setRolling(false);
  };

  const unlockDeep = async () => {
    if (!result || !analysis) return;
    setUnlocking(true);
    try {
      const r = await generateDeepAstroDiceReading(question, result.planet, result.zodiac, result.house, analysis);
      setDeepReading(r);
    } catch (e: any) { setError('深度解读失败: ' + (e.message || '')); }
    setUnlocking(false);
  };

  return (
    <View className="dice-container">
      <Text className="form-title">🎲 求一卦</Text>
      <Text className="form-subtitle">专治各种选不出来、找不到、拿不定主意</Text>
      <Text className="form-subtitle-2">轻轻一掷骰子，神庙的古老启示，即将为你揭晓答案</Text>

      <Textarea className="dice-textarea" value={question} onInput={e => setQuestion(e.detail.value)} placeholder="输入具体问题（如：这笔投资会获利吗？）" maxlength={200} />

      {question.trim() && !result && (
        <View className="dice-reminder">
          <Text className="dice-reminder-text">🙏 掷骰子前，请在心中默念自己的问题</Text>
        </View>
      )}

      <View className="dice-row">
        <View className="dice-box">
          <Text className="dice-label">行星</Text>
          <Text className={`dice-value ${rolling ? 'dice-rolling' : ''}`}>{result?.planet || '?'}</Text>
        </View>
        <View className="dice-box">
          <Text className="dice-label">星座</Text>
          <Text className={`dice-value ${rolling ? 'dice-rolling' : ''}`}>{result?.zodiac || '?'}</Text>
        </View>
        <View className="dice-box">
          <Text className="dice-label">宫位</Text>
          <Text className={`dice-value ${rolling ? 'dice-rolling' : ''}`}>{result?.house || '?'}</Text>
        </View>
      </View>

      <Button className="submit-btn" loading={rolling} disabled={rolling} onClick={roll}>
        {rolling ? '星象运转中...' : '掷出骰子'}
      </Button>

      {analysis && (
        <View className="dice-analysis">
          <Text className="dice-analysis-title">⚙️ 古典星象引擎参数</Text>
          <Text className="dice-analysis-text">
            代表星 [{result?.planet}] 落入 [{result?.zodiac}]：{analysis.status} (得分: {analysis.score}){'\n'}
            落入宫位 [{result?.house}]：{analysis.houseType}
          </Text>
        </View>
      )}

      {reading ? (
        <View className="report-section">
          <View className="markdown-content">{renderMarkdown(reading)}</View>          <View className="disclaimer-bar">
            <Text className="disclaimer-text">✨ 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
          </View>          {!deepReading && (
            <Button className="deep-btn" loading={unlocking} disabled={unlocking} onClick={unlockDeep}>
              {unlocking ? '正在凝视星盘深处...' : '🔒 解锁深度星象解读'}
            </Button>
          )}
        </View>
      ) : error ? (
        <View className="error-box"><Text className="error-text">{error}</Text></View>
      ) : null}

      {deepReading && (
        <View className="report-section deep-report">
          <Text className="deep-report-title">✨ 深度解读</Text>
          <View className="markdown-content">{renderMarkdown(deepReading)}</View>
          <View className="disclaimer-bar">
            <Text className="disclaimer-text">✨ 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── 主页面 ──────────────────────────────────────
export default function ConsultPage() {
  const [tab, setTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState('');
  const [reportError, setReportError] = useState('');

  useLoad(options => {
    if (options?.tab) setTab(options.tab);
  });

  const tabs = [
    { key: 'company', label: '🏢 公司合盘' },
    { key: 'jobhop', label: '🚀 跳槽分析' },
    { key: 'partner', label: '🤝 合伙人' },
    { key: 'dice', label: '🎲 求一卦' },
  ];

  const handleTabChange = (key: string | null) => {
    setTab(key); setReport(''); setReportError('');
  };

  const getUserData = () => {
    const bc: BirthData = Taro.getStorageSync('birthConfig');
    const nd: NatalData = Taro.getStorageSync('natalData');
    if (!bc || !nd) { Taro.showToast({ title: '请先输入出生数据', icon: 'none' }); Taro.redirectTo({ url: '/pages/input/index' }); return null; }
    return { bc, nd };
  };

  const handleCompanySubmit = async (companyBD: BirthData, companyName: string) => {
    const user = getUserData(); if (!user) return;
    setLoading(true); setReport(''); setReportError('');
    try {
      const companyND = await fetchNatalChart(companyBD);
      const astroTerms = !!Taro.getStorageSync('includeAstrologyTerms');
      const text = await generateCompanySynastryReport(user.nd, user.bc, companyND, companyBD, companyName, astroTerms);
      setReport(text);
    } catch (e: any) { setReportError('生成失败: ' + (e.message || '请稍后再试')); }
    setLoading(false);
  };

  const handleJobHopSubmit = async (companyBD: BirthData, companyName: string) => {
    const user = getUserData(); if (!user) return;
    setLoading(true); setReport(''); setReportError('');
    try {
      const companyND = await fetchNatalChart(companyBD);
      const astroTerms = !!Taro.getStorageSync('includeAstrologyTerms');
      const text = await generateJobHopReport(user.nd, user.bc, companyND, companyBD, companyName, astroTerms);
      setReport(text);
    } catch (e: any) { setReportError('生成失败: ' + (e.message || '请稍后再试')); }
    setLoading(false);
  };

  const handlePartnerSubmit = async (partnerInputs: { name: string; birthData: BirthData }[]) => {
    setLoading(true); setReport(''); setReportError('');
    try {
      const partnersWithNatal = await Promise.all(
        partnerInputs.map(async (p) => ({
          name: p.name,
          natalData: await fetchNatalChart(p.birthData),
          birthConfig: p.birthData,
        }))
      );
      const astroTerms = !!Taro.getStorageSync('includeAstrologyTerms');
      const text = await generatePartnerCompatibilityReport(partnersWithNatal, astroTerms);
      setReport(text);
    } catch (e: any) { setReportError('生成失败: ' + (e.message || '请稍后再试')); }
    setLoading(false);
  };

  const menuItems = [
    {
      key: 'jobhop',
      icon: '🧳',
      iconBg: '#ede9f7',
      title: '我要不要跳槽？',
      desc: '公司也是个生命体，也有自己的性格命运，看看你和这家公司合不合？',
    },
    {
      key: 'partner',
      icon: '👥',
      iconBg: '#e8eef7',
      title: '我和我的合伙人合不合呀？',
      desc: '我们之间什么样的关系更有利公司的发展？',
    },
    {
      key: 'company',
      icon: '🏢',
      iconBg: '#e8f2e8',
      title: '我想看看我公司今年的发展情况',
      desc: '今年适合融资吗？',
    },
    {
      key: 'dice',
      icon: '🎲',
      iconBg: '#fdf0e5',
      title: '求一卦',
      desc: '轻轻一掷骰子，神庙的古老启示为你揭晓答案',
    },
  ];

  return (
    <View className="page-root">
      <ScrollView scrollY className="consult-page" style={{ paddingBottom: '140rpx' }}>

        {/* ── 菜单首页 ── */}
        {tab === null && (
          <View>
            <View className="consult-hero">
              <Text className="consult-hero-title">遇事不决，找木星</Text>
              <Text className="consult-hero-desc">我的前世是埃及神庙的大祭司，和一般的占星师相比，我特别擅长处理商业问题，遇事不决，找我木星吧。</Text>
            </View>
            {menuItems.map(item => (
              <View key={item.key} className="consult-menu-item" onClick={() => handleTabChange(item.key)}>
                <View className="consult-menu-icon" style={{ background: item.iconBg }}>
                  <Text className="consult-menu-icon-text">{item.icon}</Text>
                </View>
                <View className="consult-menu-text">
                  <Text className="consult-menu-title">{item.title}</Text>
                  <Text className="consult-menu-desc">{item.desc}</Text>
                </View>
                <Text className="consult-menu-arrow">›</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 功能页面 ── */}
        {tab !== null && (
          <View className="consult-back" onClick={() => handleTabChange(null)}>
            <Text className="consult-back-icon">‹</Text>
            <Text className="consult-back-text">返回</Text>
          </View>
        )}

        {/* 公司合盘 */}
        {tab === 'company' && !report && !reportError && (
          <CompanyForm title="🏢 品牌基因测序" subtitle="探索你与公司的宇宙契合度" storageKey="companyBirthData" buttonText="生成合盘报告" onSubmit={handleCompanySubmit} loading={loading} />
        )}

        {/* 跳槽分析 */}
        {tab === 'jobhop' && !report && !reportError && (
          <CompanyForm title="🚀 寻找下一站" subtitle="评估你与目标公司的契合度与入职时机" storageKey="jobHopBirthData" buttonText="生成跳槽报告" onSubmit={handleJobHopSubmit} loading={loading} />
        )}

        {/* 合伙人 */}
        {tab === 'partner' && !report && !reportError && (
          <PartnerForm onSubmit={handlePartnerSubmit} loading={loading} />
        )}

        {/* 求一卦 */}
        {tab === 'dice' && <DicePanel />}

      {/* 报告显示区域（公司/跳槽/合伙人共用） */}
      {tab !== 'dice' && report && (
        <View className="report-section">
          <View className="markdown-content">{renderMarkdown(report)}</View>
          <View className="disclaimer-bar">
            <Text className="disclaimer-text">✨ 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
          </View>
          <Button className="reset-btn" onClick={() => { setReport(''); setReportError(''); }}>重新生成</Button>
        </View>
      )}

      {tab !== 'dice' && reportError && (
        <View className="error-box">
          <Text className="error-text">{reportError}</Text>
          <Button className="reset-btn" onClick={() => { setReport(''); setReportError(''); }}>重试</Button>
        </View>
      )}

      {loading && tab !== 'dice' && (
        <View className="loading-overlay">
          <Text className="loading-icon spinning">✦</Text>
          <Text className="loading-text">木星正在观测星象...</Text>
        </View>
      )}
      </ScrollView>

      {/* 底部导航栏 */}
      <View className="bottom-nav">
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/pages/daily/index' })}>
          <Text className="nav-icon">☀️</Text>
          <Text className="nav-label">每日运程</Text>
        </View>
        <View className="nav-item nav-item-active">
          <Text className="nav-icon">🧭</Text>
          <Text className="nav-label">遇事不决</Text>
          <View className="nav-dot" />
        </View>
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/pages/profile/index' })}>
          <Text className="nav-icon">👤</Text>
          <Text className="nav-label">我的</Text>
        </View>
      </View>
    </View>
  );
}
