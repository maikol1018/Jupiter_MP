export const REPORT_LOADING_HINT = '加载中请耐心等待2分钟';

export const ZODIAC_SIGNS = [
  { name: 'Aries', nameCN: '白羊座', symbol: '♈', start: 0 },
  { name: 'Taurus', nameCN: '金牛座', symbol: '♉', start: 30 },
  { name: 'Gemini', nameCN: '双子座', symbol: '♊', start: 60 },
  { name: 'Cancer', nameCN: '巨蟹座', symbol: '♋', start: 90 },
  { name: 'Leo', nameCN: '狮子座', symbol: '♌', start: 120 },
  { name: 'Virgo', nameCN: '处女座', symbol: '♍', start: 150 },
  { name: 'Libra', nameCN: '天秤座', symbol: '♎', start: 180 },
  { name: 'Scorpio', nameCN: '天蝎座', symbol: '♏', start: 210 },
  { name: 'Sagittarius', nameCN: '射手座', symbol: '♐', start: 240 },
  { name: 'Capricorn', nameCN: '摩羯座', symbol: '♑', start: 270 },
  { name: 'Aquarius', nameCN: '水瓶座', symbol: '♒', start: 300 },
  { name: 'Pisces', nameCN: '双鱼座', symbol: '♓', start: 330 },
];

export const PLANET_SYMBOLS: Record<string, string> = {
  Sun: '☉',
  Moon: '☽',
  Mercury: '☿',
  Venus: '♀',
  Mars: '♂',
  Jupiter: '♃',
  Saturn: '♄',
  Uranus: '♅',
  Neptune: '♆',
  Pluto: '♇',
  "North Node": '☊',
  "South Node": '☋',
  Chiron: '⚷',
  ASC: 'Asc',
  MC: 'Mc'
};

export const PLANET_NAMES_CN: Record<string, string> = {
  Sun: '太阳',
  Moon: '月亮',
  Mercury: '水星',
  Venus: '金星',
  Mars: '火星',
  Jupiter: '木星',
  Saturn: '土星',
  Uranus: '天王星',
  Neptune: '海王星',
  Pluto: '冥王星',
  "North Node": '北交点',
  "South Node": '南交点',
  Chiron: '凯龙星',
  ASC: '上升',
  MC: '中天'
};

export const PLANET_COLORS: Record<string, string> = {
  Sun: '#D97706',    // Amber/Gold
  Moon: '#4B5563',   // Dark Gray
  Mercury: '#059669',// Green
  Venus: '#047857',  // Dark Green
  Mars: '#DC2626',   // Red
  Jupiter: '#7C3AED',// Purple
  Saturn: '#92400E', // Brown
  Uranus: '#2563EB', // Blue
  Neptune: '#4F46E5',// Indigo
  Pluto: '#1F2937',  // Black/Gray
  "North Node": '#0891b2', // Cyan
  "South Node": '#0891b2', // Cyan
  Chiron: '#be185d', // Pink
  ASC: '#dc2626',    // Red
  MC: '#059669'      // Green
};

// LSA Standard Aspects
export const ASPECT_CONFIG = [
  { name: 'Conjunction', labelCN: '合相', angle: 0, orb: 8, color: '#F59E0B', strokeWidth: 3 }, // Gold
  { name: 'Opposition', labelCN: '对分相', angle: 180, orb: 8, color: '#DC2626', strokeWidth: 1.5 }, // Red
  { name: 'Square', labelCN: '四分相', angle: 90, orb: 8, color: '#DC2626', strokeWidth: 1.5 },      // Red
  { name: 'Trine', labelCN: '三分相', angle: 120, orb: 8, color: '#10B981', strokeWidth: 1.5 },       // Green
  { name: 'Sextile', labelCN: '六分相', angle: 60, orb: 6, color: '#3B82F6', strokeWidth: 1, dash: "4 2" }, // Blue dashed
];