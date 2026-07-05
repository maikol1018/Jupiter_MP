import { View, Text, Button, Input, Textarea, Picker, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { BirthData, NatalData } from '../../../types';
import { REPORT_LOADING_HINT } from '../../../constants';
import { fetchNatalChart } from '../../../services/astroService';
import { ensureActiveProfileRecord, getProfileRecords } from '../../../services/profileService';
import {
  generateCompanySynastryReport,
  generateCompanyAnnualReport,
  generateJobHopReport,
  generatePartnerCompatibilityReport,
  generateAstroDiceReading,
  generateDeepAstroDiceReading,
} from '../../../services/geminiService';
import ChatBox from '../../../components/ChatBox';
import Icon from '../../../components/Icon';
import { CHINA_REGION_TREE, getDistrictOptions } from '../../../services/chinaRegions';
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
const dateColumns = [yearRange.map(v => v + '年'), monthRange.map(v => v + '月'), dayRange.map(v => v + '日')];
const timeColumns = [hourRange.map(v => String(v).padStart(2, '0') + '时'), minuteRange.map(v => String(v).padStart(2, '0') + '分')];

const getRegionColumns = (idx: number[]) => {
  const province = CHINA_REGION_TREE[idx[0]] || CHINA_REGION_TREE[0];
  const city = province.cities[idx[1]] || province.cities[0];
  return [
    CHINA_REGION_TREE.map(item => item.name),
    province.cities.map(item => item.name),
    getDistrictOptions(city),
  ];
};

const getRegionByIdx = (idx: number[]) => {
  const province = CHINA_REGION_TREE[idx[0]] || CHINA_REGION_TREE[0];
  const city = province.cities[idx[1]] || province.cities[0];
  const districtOptions = getDistrictOptions(city);
  const district = districtOptions[idx[2]] || districtOptions[0];
  return { province: province.name, city: city.name, district };
};

const formatRegionLabel = (parts: string[]) => {
  const [province, city, district] = parts;
  return district && district !== city
    ? [province, city, district].filter(Boolean).join(' ')
    : [province, city].filter(Boolean).join(' ');
};

const getCoordsForRegion = (provinceName: string, cityName: string) => (
  cityCoords[cityName] || cityCoords[provinceName] || { lat: 25.033, lon: 121.565 }
);

// ── 公司/跳槽 输入表单组件 ──────────────────────
// 城市坐标映射（用于根据地区选择器映射经纬度）
const cityCoords: Record<string, { lat: number; lon: number }> = {
  '北京市': { lat: 39.9042, lon: 116.4074 }, '上海市': { lat: 31.2304, lon: 121.4737 },
  '天津市': { lat: 39.3434, lon: 117.3616 }, '重庆市': { lat: 29.5630, lon: 106.5516 },
  '广州市': { lat: 23.1291, lon: 113.2644 }, '深圳市': { lat: 22.5431, lon: 114.0579 },
  '成都市': { lat: 30.5728, lon: 104.0668 }, '杭州市': { lat: 30.2741, lon: 120.1551 },
  '南京市': { lat: 32.0603, lon: 118.7969 }, '武汉市': { lat: 30.5928, lon: 114.3055 },
  '西安市': { lat: 34.3416, lon: 108.9398 }, '长沙市': { lat: 28.2282, lon: 112.9388 },
  '苏州市': { lat: 31.2989, lon: 120.5853 }, '郑州市': { lat: 34.7466, lon: 113.6253 },
  '济南市': { lat: 36.6512, lon: 117.1201 }, '青岛市': { lat: 36.0671, lon: 120.3826 },
  '合肥市': { lat: 31.8206, lon: 117.2272 }, '福州市': { lat: 26.0745, lon: 119.2965 },
  '厦门市': { lat: 24.4797, lon: 118.0894 }, '昆明市': { lat: 25.0453, lon: 102.7093 },
  '哈尔滨市': { lat: 45.8038, lon: 126.5349 }, '沈阳市': { lat: 41.8057, lon: 123.4315 },
  '大连市': { lat: 38.9140, lon: 121.6147 }, '台北市': { lat: 25.0330, lon: 121.5654 },
  '高雄市': { lat: 22.6273, lon: 120.3014 }, '香港': { lat: 22.3193, lon: 114.1694 },
  '澳门': { lat: 22.1987, lon: 113.5439 }, '赤峰市': { lat: 42.2578, lon: 118.8869 },
  // 省级兜底
  '广东省': { lat: 23.1291, lon: 113.2644 }, '浙江省': { lat: 30.2741, lon: 120.1551 },
  '江苏省': { lat: 32.0603, lon: 118.7969 }, '四川省': { lat: 30.5728, lon: 104.0668 },
  '湖北省': { lat: 30.5928, lon: 114.3055 }, '山东省': { lat: 36.6512, lon: 117.1201 },
  '福建省': { lat: 26.0745, lon: 119.2965 }, '台湾省': { lat: 25.0330, lon: 121.5654 },
  '香港特别行政区': { lat: 22.3193, lon: 114.1694 }, '澳门特别行政区': { lat: 22.1987, lon: 113.5439 },
};
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
  const [city, setCity] = useState('台北市');
  const [lat, setLat] = useState(25.033);
  const [lon, setLon] = useState(121.565);
  const [region, setRegion] = useState<string[]>(['台湾省', '台北市', '中正区']);
  const [regionIdx, setRegionIdx] = useState([CHINA_REGION_TREE.findIndex(item => item.name === '台湾省'), 0, 0]);
  const regionColumns = getRegionColumns(regionIdx);

  useLoad(() => {
    try {
      const saved = Taro.getStorageSync(storageKey);
      if (saved) {
        if (saved.companyName) setName(saved.companyName);
        if (saved.date) { setYear(saved.date.year); setMonth(saved.date.month); setDay(saved.date.day); }
        if (saved.time) { setHour(saved.time.hour); setMinute(saved.time.minute); }
        if (saved.location) { setCity(saved.location.name); setLat(saved.location.lat); setLon(saved.location.lon); }
        if (saved.region) setRegion(saved.region);
        if (saved.regionIdx) setRegionIdx(saved.regionIdx);
      }
    } catch (_error) {}
  });

  const handleRegionChange = (e: any) => {
    const val: number[] = e.detail.value;
    const selected = getRegionByIdx(val);
    const label = formatRegionLabel([selected.province, selected.city, selected.district]);
    const coords = getCoordsForRegion(selected.province, selected.city);
    setRegionIdx(val);
    setRegion([selected.province, selected.city, selected.district]);
    setCity(label);
    setLat(coords.lat);
    setLon(coords.lon);
  };

  const handleRegionColumnChange = (e: any) => {
    const { column, value } = e.detail;
    const nextIdx = [...regionIdx];
    nextIdx[column] = value;
    if (column === 0) {
      nextIdx[1] = 0;
      nextIdx[2] = 0;
    }
    if (column === 1) nextIdx[2] = 0;
    setRegionIdx(nextIdx);
  };

  const handleSubmit = () => {
    if (!name.trim()) { Taro.showToast({ title: '请输入名称', icon: 'none' }); return; }
    Taro.setStorageSync(storageKey, { companyName: name, date: { year, month, day }, time: { hour, minute }, location: { name: city, lat, lon }, region, regionIdx });
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
        <Picker mode="multiSelector" range={regionColumns} value={regionIdx} onChange={handleRegionChange} onColumnChange={handleRegionColumnChange}>
          <View className="form-input picker-display">
            <Text>{region[1] ? formatRegionLabel(region) : '请选择注册地点'}</Text>
            <Text className="picker-arrow">›</Text>
          </View>
        </Picker>
      </View>

      <Button className="submit-btn" loading={loading} disabled={loading} onClick={handleSubmit}>
        {loading ? '生成报告中...' : buttonText}
      </Button>
      {loading && <Text className="loading-hint">{REPORT_LOADING_HINT}</Text>}
    </View>
  );
}

// ── 合伙人对话式输入 ───────────────────────────
interface PartnerDraft {
  id: string;
  name: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  city: string;
  lat: number;
  lon: number;
  region: string[];
}

interface PartnerChatMsg { role: 'assistant' | 'user'; content: string }

const createPartnerDraft = (id = Date.now().toString()): PartnerDraft => ({
  id,
  name: '',
  year: 2000,
  month: 1,
  day: 1,
  hour: 12,
  minute: 0,
  city: '',
  lat: 0,
  lon: 0,
  region: [],
});

const getPartnerName = (partner: PartnerDraft) => partner.name.trim() || '这位伙伴';

const getBirthHourMinute = (birthConfig: BirthData) => {
  const hour = Math.floor(birthConfig.hour || 0);
  const minute = typeof birthConfig.minute === 'number'
    ? birthConfig.minute
    : Math.round(((birthConfig.hour || 0) - hour) * 60);
  return { hour, minute };
};

const formatProfileMeta = (birthConfig: BirthData) => {
  const { hour, minute } = getBirthHourMinute(birthConfig);
  return `${birthConfig.year}年${birthConfig.month}月${birthConfig.day}日 · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} · ${birthConfig.city || '未记录城市'}`;
};

function PartnerForm({ onSubmit, loading }: { onSubmit: (partners: { name: string; birthData: BirthData }[]) => void; loading: boolean }) {
  const [profileRecords, setProfileRecords] = useState(() => getProfileRecords());
  const [partnerList, setPartnerList] = useState<PartnerDraft[]>([]);
  const [draft, setDraft] = useState<PartnerDraft>(() => createPartnerDraft('1'));
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<PartnerChatMsg[]>([
    { role: 'assistant', content: '请告诉木星，你的第1位伙伴叫什么名字？' },
  ]);
  const [nameDraft, setNameDraft] = useState('');
  const [dateIdx, setDateIdx] = useState([yearRange.indexOf(2000), 0, 0]);
  const [timeIdx, setTimeIdx] = useState([12, 0]);
  const [regionIdx, setRegionIdx] = useState([CHINA_REGION_TREE.findIndex(item => item.name === '台湾省'), 0, 0]);
  const [error, setError] = useState('');
  const partnerRegionColumns = getRegionColumns(regionIdx);

  useLoad(() => {
    setProfileRecords(getProfileRecords());
  });

  const availableProfileRecords = profileRecords.filter(record => (
    partnerList.every(partner => partner.id !== record.id)
  ));

  const appendExchange = (userText: string, assistantText?: string) => {
    setMessages(prev => {
      const next: PartnerChatMsg[] = [...prev, { role: 'user', content: userText }];
      if (assistantText) next.push({ role: 'assistant', content: assistantText });
      return next;
    });
  };

  const resetDraft = (nextIndex: number) => {
    const nextDraft = createPartnerDraft(String(Date.now()));
    setDraft(nextDraft);
    setNameDraft('');
    setDateIdx([yearRange.indexOf(nextDraft.year), 0, 0]);
    setTimeIdx([nextDraft.hour, nextDraft.minute]);
    setRegionIdx([CHINA_REGION_TREE.findIndex(item => item.name === '台湾省'), 0, 0]);
    setError('');
    setStep(0);
    setMessages(prev => [...prev, { role: 'assistant', content: `继续记录第${nextIndex}位伙伴，请告诉木星TA叫什么名字？` }]);
  };

  const removePartner = (id: string) => {
    setPartnerList(partnerList.filter(p => p.id !== id));
  };

  const addProfileAsPartner = (record: ReturnType<typeof getProfileRecords>[number]) => {
    if (partnerList.length >= 4) {
      Taro.showToast({ title: '最多支持4位合伙人', icon: 'none' });
      return;
    }
    if (partnerList.some(partner => partner.id === record.id)) {
      Taro.showToast({ title: '这位已经加入伙伴', icon: 'none' });
      return;
    }
    const birthConfig = record.birthConfig;
    const { hour, minute } = getBirthHourMinute(birthConfig);
    const completed: PartnerDraft = {
      id: record.id,
      name: birthConfig.name?.trim() || record.category || '未命名档案',
      year: birthConfig.year,
      month: birthConfig.month,
      day: birthConfig.day,
      hour,
      minute,
      city: birthConfig.city || '未记录城市',
      lat: birthConfig.lat,
      lon: birthConfig.lon,
      region: birthConfig.city ? [birthConfig.city] : [],
    };
    setPartnerList(prev => [...prev, completed]);
    setError('');
    setStep(4);
    setNameDraft('');
    appendExchange(`从已记录档案加入：${completed.name}`, `木星已经把${completed.name}加入伙伴名单。可以继续添加伙伴，或直接生成合盘报告。`);
  };

  const handleNameConfirm = () => {
    const name = nameDraft.trim();
    if (!name) { setError('请先告诉木星伙伴姓名'); return; }
    const nextDraft = { ...draft, name };
    setDraft(nextDraft);
    setError('');
    appendExchange(name, `木星记下了。${name}是哪一天出生的？请选择阳历生日。`);
    setStep(1);
  };

  const handleDateChange = (e: any) => {
    const vals: number[] = e.detail.value;
    setDateIdx(vals);
    setDraft(prev => ({ ...prev, year: yearRange[vals[0]], month: monthRange[vals[1]], day: dayRange[vals[2]] }));
  };

  const handleDateColumnChange = (e: any) => {
    const { column, value } = e.detail;
    const nextIdx = [...dateIdx];
    nextIdx[column] = value;
    setDateIdx(nextIdx);
  };

  const handleDateConfirm = () => {
    setError('');
    appendExchange(`${draft.year}年 ${draft.month}月 ${draft.day}日`, `请继续告诉木星，${getPartnerName(draft)}具体几点几分出生呢？`);
    setStep(2);
  };

  const handleTimeChange = (e: any) => {
    const vals: number[] = e.detail.value;
    setTimeIdx(vals);
    setDraft(prev => ({ ...prev, hour: hourRange[vals[0]], minute: minuteRange[vals[1]] }));
  };

  const handleTimeColumnChange = (e: any) => {
    const { column, value } = e.detail;
    const nextIdx = [...timeIdx];
    nextIdx[column] = value;
    setTimeIdx(nextIdx);
  };

  const handleTimeConfirm = () => {
    setError('');
    appendExchange(`${String(draft.hour).padStart(2, '0')}时 ${String(draft.minute).padStart(2, '0')}分`, `最后请告诉木星，${getPartnerName(draft)}出生在哪座城市？`);
    setStep(3);
  };

  const handlePartnerRegionChange = (e: any) => {
    const val: number[] = e.detail.value;
    const selected = getRegionByIdx(val);
    const label = formatRegionLabel([selected.province, selected.city, selected.district]);
    const coords = getCoordsForRegion(selected.province, selected.city);
    setRegionIdx(val);
    setDraft(prev => ({ ...prev, region: [selected.province, selected.city, selected.district], city: label, lat: coords.lat, lon: coords.lon }));
  };

  const handlePartnerRegionColumnChange = (e: any) => {
    const { column, value } = e.detail;
    const nextIdx = [...regionIdx];
    nextIdx[column] = value;
    if (column === 0) {
      nextIdx[1] = 0;
      nextIdx[2] = 0;
    }
    if (column === 1) nextIdx[2] = 0;
    setRegionIdx(nextIdx);
  };

  const handleCityConfirm = () => {
    if (!draft.city) { setError('请告诉木星伙伴出生城市'); return; }
    const completed = { ...draft };
    setPartnerList(prev => [...prev, completed]);
    setError('');
    appendExchange(formatRegionLabel(completed.region), `木星已经记录好${getPartnerName(completed)}了。可以继续添加伙伴，或直接生成合盘报告。`);
    setStep(4);
  };

  const addPartner = () => {
    if (partnerList.length >= 4) {
      Taro.showToast({ title: '最多支持4位合伙人', icon: 'none' });
      return;
    }
    resetDraft(partnerList.length + 1);
  };

  const handleSubmit = () => {
    const valid = partnerList.filter(p => p.name.trim() && p.city);
    if (valid.length < 1) { Taro.showToast({ title: '请至少填写一位合伙人', icon: 'none' }); return; }
    onSubmit(valid.map(p => ({
      name: p.name,
      birthData: { year: p.year, month: p.month, day: p.day, hour: p.hour + p.minute / 60, minute: p.minute, lat: p.lat, lon: p.lon, city: p.city, timezone: 8, name: p.name }
    })));
  };

  return (
    <View className="form-container">
      <Text className="form-title">🤝 合伙避坑指南</Text>
      <Text className="form-subtitle">最多支持4位合伙人</Text>

      <View className="partner-chat-stream">
        {messages.map((m, i) => (
          <View key={i} className={`partner-chat-row partner-chat-row-${m.role}`}>
            <View className={`partner-chat-bubble partner-chat-bubble-${m.role}`}>
              <Text className="partner-chat-text">{m.content}</Text>
            </View>
          </View>
        ))}
      </View>

      {partnerList.length > 0 && (
        <View className="partner-summary">
          <Text className="partner-summary-title">已记录伙伴</Text>
          {partnerList.map((p, idx) => (
            <View key={p.id} className="partner-summary-item">
              <View className="partner-summary-main">
                <Text className="partner-summary-name">{idx + 1}. {p.name}</Text>
                <Text className="partner-summary-meta">{p.year}年{p.month}月{p.day}日 · {String(p.hour).padStart(2, '0')}:{String(p.minute).padStart(2, '0')} · {p.city}</Text>
              </View>
              <Text className="partner-remove" onClick={() => removePartner(p.id)}>删除</Text>
            </View>
          ))}
        </View>
      )}

      {error ? <Text className="error-text">{error}</Text> : null}

      {availableProfileRecords.length > 0 && partnerList.length < 4 && (step === 0 || step === 4) && (
        <View className="partner-profile-picker">
          <Text className="partner-profile-title">从已记录人物加入</Text>
          <Text className="partner-profile-hint">点选后会直接加入伙伴，不用重新输入生日城市。</Text>
          {availableProfileRecords.map(record => (
            <View key={record.id} className="partner-profile-item" onClick={() => addProfileAsPartner(record)}>
              <View className="partner-profile-main">
                <Text className="partner-profile-name">{record.birthConfig.name?.trim() || record.category || '未命名档案'}</Text>
                <Text className="partner-profile-meta">{formatProfileMeta(record.birthConfig)}</Text>
              </View>
              <Text className="partner-profile-add">加入</Text>
            </View>
          ))}
        </View>
      )}

      <View className="partner-action-card">
        {step === 0 && (
          <View>
            <Input
              className="form-input"
              value={nameDraft}
              onInput={e => setNameDraft(e.detail.value)}
              placeholder="伙伴姓名"
              confirmType="done"
              onConfirm={handleNameConfirm}
            />
            <View className="partner-btn-row">
              <View className="partner-primary-btn" onClick={handleNameConfirm}><Text>下一步</Text></View>
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <Picker mode="multiSelector" range={dateColumns} value={dateIdx} onChange={handleDateChange} onColumnChange={handleDateColumnChange}>
              <View className="form-input picker-display">
                <Text>{draft.year}年 {draft.month}月 {draft.day}日</Text>
                <Text className="picker-arrow">›</Text>
              </View>
            </Picker>
            <View className="partner-btn-row">
              <View className="partner-primary-btn" onClick={handleDateConfirm}><Text>下一步</Text></View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Picker mode="multiSelector" range={timeColumns} value={timeIdx} onChange={handleTimeChange} onColumnChange={handleTimeColumnChange}>
              <View className="form-input picker-display">
                <Text>{String(draft.hour).padStart(2, '0')}时 {String(draft.minute).padStart(2, '0')}分</Text>
                <Text className="picker-arrow">›</Text>
              </View>
            </Picker>
            <View className="partner-btn-row">
              <View className="partner-primary-btn" onClick={handleTimeConfirm}><Text>下一步</Text></View>
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <Picker mode="multiSelector" range={partnerRegionColumns} value={regionIdx} onChange={handlePartnerRegionChange} onColumnChange={handlePartnerRegionColumnChange}>
              <View className="form-input picker-display">
                <Text className={draft.region.length > 0 ? '' : 'picker-placeholder'}>{draft.region.length > 0 ? formatRegionLabel(draft.region) : '请选择出生城市'}</Text>
                <Text className="picker-arrow">›</Text>
              </View>
            </Picker>
            <View className="partner-btn-row">
              <View className="partner-primary-btn" onClick={handleCityConfirm}><Text>完成记录</Text></View>
            </View>
          </View>
        )}

        {step === 4 && (
          <View>
            <View className="partner-btn-row">
              {partnerList.length < 4 && (
                <View className="partner-secondary-btn" onClick={loading ? undefined : addPartner}><Text>添加下一位</Text></View>
              )}
              <View className={`partner-primary-btn${loading ? ' partner-btn-disabled' : ''}`} onClick={loading ? undefined : handleSubmit}>
                <Text>{loading ? '生成报告中...' : '生成合盘报告'}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
      {loading && <Text className="loading-hint">{REPORT_LOADING_HINT}</Text>}
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

  const getAsked = (): string[] => { try { return Taro.getStorageSync('astrodice_asked') || []; } catch (_error) { return []; } };

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
      <Text className="form-title">獲取指引</Text>
      <Text className="form-subtitle">专治各种选不出来、找不到、拿不定主意</Text>
      <Text className="form-subtitle-2">轻轻一掷投子，神庙的古老启示，即将为你揭晓答案</Text>

      <Textarea className="dice-textarea" value={question} onInput={e => setQuestion(e.detail.value)} placeholder="输入具体问题（如：这笔投资会获利吗？）" maxlength={200} />

      {question.trim() && !result && (
        <View className="dice-reminder">
          <Text className="dice-reminder-text">🙏 掷投子前，请在心中默念自己的问题</Text>
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
        {rolling ? '星象运转中...' : '掷出投子'}
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
            <Text className="disclaimer-text"><Icon name="sparkle" size={22} color="rgba(61,28,10,0.38)" /> 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
          </View>          {!deepReading && (
            <Button className="deep-btn" loading={unlocking} disabled={unlocking} onClick={unlockDeep}>
              {unlocking ? '正在凝视星盘深处...' : '解锁深度解读'}
            </Button>
          )}
        </View>
      ) : error ? (
        <View className="error-box"><Text className="error-text">{error}</Text></View>
      ) : null}

      {deepReading && (
        <View className="report-section deep-report">
          <Text className="deep-report-title"><Icon name="sparkle" size={32} color="#7a3520" /> 深度解读</Text>
          <View className="markdown-content">{renderMarkdown(deepReading)}</View>
          <View className="disclaimer-bar">
            <Text className="disclaimer-text"><Icon name="sparkle" size={22} color="rgba(61,28,10,0.38)" /> 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
          </View>
        </View>
      )}

      {/* 问与答 - 骰子解读后 */}
      {(reading || deepReading) && !rolling && (
        <ChatBox reportContent={[reading, deepReading].filter(Boolean).join('\n\n')} />
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
    { key: 'dice', label: '🔮 卜一卦' },
  ];

  const handleTabChange = (key: string | null) => {
    setTab(key); setReport(''); setReportError('');
  };

  const getUserData = () => {
    const activeRecord = ensureActiveProfileRecord();
    const bc: BirthData | undefined = activeRecord?.birthConfig;
    const nd: NatalData | undefined = activeRecord?.natalData;
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
      icon: 'briefcase',
      iconBg: '#ede9f7',
      title: '我要不要跳槽？',
      desc: '公司也是个生命体，也有自己的性格，看看你和这家公司合不合？',
    },
    {
      key: 'partner',
      icon: 'team',
      iconBg: '#e8eef7',
      title: '我和我的合伙人合不合呀？',
      desc: '我们之间什么样的关系更有利公司的发展？',
    },
    {
      key: 'company',
      icon: 'building',
      iconBg: '#e8f2e8',
      title: '我想看看我公司今年的发展情况',
      desc: '今年适合融资吗？',
    },
    {
      key: 'dice',
      icon: 'sparkle',
      iconBg: '#f5e8df',
      title: '卜一卦',
      desc: '把心里的问题交给星骰，听听神庙给你的提示。',
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
                  <Icon name={item.icon} size={38} color="#7a3520" />
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
            <Icon name="arrow-left" size={44} color="rgba(61,28,10,0.55)" />
            <Text className="consult-back-text">返回</Text>
          </View>
        )}

        {/* 公司合盘 */}
        {tab === 'company' && !report && !reportError && (
          <CompanyForm title="品牌基因测序" subtitle="木星与你探索「公司&你」的宇宙契合度" storageKey="companyBirthData" buttonText="生成合盘报告" onSubmit={handleCompanySubmit} loading={loading} />
        )}

        {/* 跳槽分析 */}
        {tab === 'jobhop' && !report && !reportError && (
          <CompanyForm title="寻找下一站" subtitle="评估你与目标公司的契合度与入职时机" storageKey="jobHopBirthData" buttonText="生成跳槽报告" onSubmit={handleJobHopSubmit} loading={loading} />
        )}

        {/* 合伙人 */}
        {tab === 'partner' && !report && !reportError && (
          <PartnerForm onSubmit={handlePartnerSubmit} loading={loading} />
        )}

        {/* 卜一卦 */}
        {tab === 'dice' && (
          <DicePanel />
        )}

      {/* 报告显示区域（公司/跳槽/合伙人共用） */}
      {report && (
        <View className="report-section">
          <View className="markdown-content">{renderMarkdown(report)}</View>
          <View className="disclaimer-bar">
            <Text className="disclaimer-text"><Icon name="sparkle" size={22} color="rgba(61,28,10,0.38)" /> 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
          </View>
          <ChatBox reportContent={report} />
          <Button className="reset-btn" onClick={() => { setReport(''); setReportError(''); }}>重新生成</Button>
        </View>
      )}

      {reportError && (
        <View className="error-box">
          <Text className="error-text">{reportError}</Text>
          <Button className="reset-btn" onClick={() => { setReport(''); setReportError(''); }}>重试</Button>
        </View>
      )}

      {loading && (
        <View className="loading-overlay">
            <Icon name="star" size={48} color="#c97b6e" className="spinning" />
          <Text className="loading-text">每日气象...</Text>
          <Text className="loading-hint">{REPORT_LOADING_HINT}</Text>
        </View>
      )}
      </ScrollView>

      {/* 底部导航栏 */}
      <View className="bottom-nav">
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/packageA/pages/daily/index' })}>
          <Icon name="sun" size={38} color="rgba(61,28,10,0.4)" />
          <Text className="nav-label">每日运程</Text>
        </View>
        <View className="nav-item nav-item-active">
          <Icon name="compass" size={38} color="#7a3520" />
          <Text className="nav-label">遇事不决</Text>
          <View className="nav-dot" />
        </View>
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/packageA/pages/profile/index' })}>
          <Icon name="user" size={38} color="rgba(61,28,10,0.4)" />
          <Text className="nav-label">我的</Text>
        </View>
      </View>
    </View>
  );
}
