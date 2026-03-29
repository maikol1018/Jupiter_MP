import { View, Text, Input, Button, Image, Picker } from '@tarojs/components';
const catAvatar = require('../../assets/cat-avatar.jpg');
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { fetchNatalChart } from '../../services/astroService';
import { BirthData } from '../../types';
import './index.scss';

const cityCoords: Record<string, { lat: number; lon: number }> = {
  '北京市': { lat: 39.9042, lon: 116.4074 },
  '上海市': { lat: 31.2304, lon: 121.4737 },
  '天津市': { lat: 39.3434, lon: 117.3616 },
  '重庆市': { lat: 29.5630, lon: 106.5516 },
  '广州市': { lat: 23.1291, lon: 113.2644 },
  '深圳市': { lat: 22.5431, lon: 114.0579 },
  '东莞市': { lat: 23.0207, lon: 113.7518 },
  '佛山市': { lat: 23.0219, lon: 113.1219 },
  '珠海市': { lat: 22.2710, lon: 113.5767 },
  '中山市': { lat: 22.5176, lon: 113.3926 },
  '惠州市': { lat: 23.1115, lon: 114.4152 },
  '汕头市': { lat: 23.3535, lon: 116.6820 },
  '成都市': { lat: 30.5728, lon: 104.0668 },
  '绵阳市': { lat: 31.4678, lon: 104.6796 },
  '杭州市': { lat: 30.2741, lon: 120.1551 },
  '宁波市': { lat: 29.8683, lon: 121.5440 },
  '温州市': { lat: 28.0000, lon: 120.6722 },
  '苏州市': { lat: 31.2989, lon: 120.5853 },
  '南京市': { lat: 32.0603, lon: 118.7969 },
  '无锡市': { lat: 31.4906, lon: 120.3119 },
  '徐州市': { lat: 34.2044, lon: 117.2851 },
  '武汉市': { lat: 30.5928, lon: 114.3055 },
  '西安市': { lat: 34.3416, lon: 108.9398 },
  '郑州市': { lat: 34.7466, lon: 113.6253 },
  '济南市': { lat: 36.6512, lon: 117.1201 },
  '青岛市': { lat: 36.0671, lon: 120.3826 },
  '烟台市': { lat: 37.5390, lon: 121.3913 },
  '长沙市': { lat: 28.2282, lon: 112.9388 },
  '合肥市': { lat: 31.8206, lon: 117.2272 },
  '南昌市': { lat: 28.6820, lon: 115.8579 },
  '福州市': { lat: 26.0745, lon: 119.2965 },
  '厦门市': { lat: 24.4797, lon: 118.0894 },
  '泉州市': { lat: 24.8741, lon: 118.6757 },
  '哈尔滨市': { lat: 45.8038, lon: 126.5349 },
  '沈阳市': { lat: 41.8057, lon: 123.4315 },
  '大连市': { lat: 38.9140, lon: 121.6147 },
  '长春市': { lat: 43.8171, lon: 125.3235 },
  '昆明市': { lat: 25.0453, lon: 102.7093 },
  '贵阳市': { lat: 26.6470, lon: 106.6302 },
  '南宁市': { lat: 22.8170, lon: 108.3665 },
  '海口市': { lat: 20.0444, lon: 110.1999 },
  '三亚市': { lat: 18.2528, lon: 109.5120 },
  '乌鲁木齐市': { lat: 43.8256, lon: 87.6168 },
  '兰州市': { lat: 36.0611, lon: 103.8343 },
  '西宁市': { lat: 36.6232, lon: 101.7782 },
  '银川市': { lat: 38.4872, lon: 106.2309 },
  '呼和浩特市': { lat: 40.8426, lon: 111.7492 },
  '太原市': { lat: 37.8706, lon: 112.5489 },
  '石家庄市': { lat: 38.0428, lon: 114.5149 },
  '保定市': { lat: 38.8671, lon: 115.4644 },
  '唐山市': { lat: 39.6292, lon: 118.1800 },
  '拉萨市': { lat: 29.6500, lon: 91.1000 },
  '台北市': { lat: 25.0330, lon: 121.5654 },
  '高雄市': { lat: 22.6273, lon: 120.3014 },
  '台中市': { lat: 24.1477, lon: 120.6736 },
  '香港': { lat: 22.3193, lon: 114.1694 },
  '澳门': { lat: 22.1987, lon: 113.5439 },
  // 省级兜底
  '广东省': { lat: 23.1291, lon: 113.2644 },
  '浙江省': { lat: 30.2741, lon: 120.1551 },
  '江苏省': { lat: 32.0603, lon: 118.7969 },
  '四川省': { lat: 30.5728, lon: 104.0668 },
  '湖北省': { lat: 30.5928, lon: 114.3055 },
  '湖南省': { lat: 28.2282, lon: 112.9388 },
  '山东省': { lat: 36.6512, lon: 117.1201 },
  '河南省': { lat: 34.7466, lon: 113.6253 },
  '福建省': { lat: 26.0745, lon: 119.2965 },
  '云南省': { lat: 25.0453, lon: 102.7093 },
  '陕西省': { lat: 34.3416, lon: 108.9398 },
  '辽宁省': { lat: 41.8057, lon: 123.4315 },
  '黑龙江省': { lat: 45.8038, lon: 126.5349 },
  '吉林省': { lat: 43.8171, lon: 125.3235 },
  '安徽省': { lat: 31.8206, lon: 117.2272 },
  '江西省': { lat: 28.6820, lon: 115.8579 },
  '广西壮族自治区': { lat: 22.8170, lon: 108.3665 },
  '贵州省': { lat: 26.6470, lon: 106.6302 },
  '新疆维吾尔自治区': { lat: 43.8256, lon: 87.6168 },
  '甘肃省': { lat: 36.0611, lon: 103.8343 },
  '青海省': { lat: 36.6232, lon: 101.7782 },
  '宁夏回族自治区': { lat: 38.4872, lon: 106.2309 },
  '内蒙古自治区': { lat: 40.8426, lon: 111.7492 },
  '山西省': { lat: 37.8706, lon: 112.5489 },
  '河北省': { lat: 38.0428, lon: 114.5149 },
  '海南省': { lat: 20.0444, lon: 110.1999 },
  '西藏自治区': { lat: 29.6500, lon: 91.1000 },
  '香港特别行政区': { lat: 22.3193, lon: 114.1694 },
  '澳门特别行政区': { lat: 22.1987, lon: 113.5439 },
  '台湾省': { lat: 25.0330, lon: 121.5654 },
};

export default function InputPage() {
  const [name, setName] = useState('');
  const [year, setYear] = useState('1990');
  const [month, setMonth] = useState('1');
  const [day, setDay] = useState('1');
  const [hour, setHour] = useState('12');
  const [minute, setMinute] = useState('0');
  const [city, setCity] = useState('上海市');
  const [lat, setLat] = useState('31.2304');
  const [lon, setLon] = useState('121.4737');
  const [region, setRegion] = useState<string[]>(['上海市', '上海市', '黄浦区']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [includeAstroTerms, setIncludeAstroTerms] = useState(() => {
    try { return !!Taro.getStorageSync('includeAstrologyTerms'); } catch { return false; }
  });

  const handleRegionChange = (e: any) => {
    const val: string[] = e.detail.value;
    setRegion(val);
    const cityName = val[1] || val[0] || '';
    setCity(cityName);
    const coords = cityCoords[cityName] || cityCoords[val[0]] || { lat: 31.2304, lon: 121.4737 };
    setLat(coords.lat.toString());
    setLon(coords.lon.toString());
  };

  const handleSubmit = async () => {
    setError('');
    if (!city) { setError('请填写出生城市或选择城市'); return; }
    const y = parseInt(year), m = parseInt(month), d = parseInt(day);
    const h = parseInt(hour), min = parseInt(minute);
    if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(h)) {
      setError('请填写完整的出生日期和时间'); return;
    }

    setLoading(true);
    try {
      const parsedLat = parseFloat(lat);
      const parsedLon = parseFloat(lon);
      // All locations in the picker are China/Taiwan/HK/Macau → UTC+8
      const timezone = 8;
      const birthConfig: BirthData = {
        year: y, month: m, day: d,
        hour: h + min / 60,
        minute: min,
        lat: parsedLat,
        lon: parsedLon,
        city,
        timezone,
        name: name || undefined,
      };
      const natalData = await fetchNatalChart(birthConfig);
      Taro.setStorageSync('birthConfig', birthConfig);
      Taro.setStorageSync('natalData', natalData);
      Taro.setStorageSync('includeAstrologyTerms', includeAstroTerms);
      Taro.redirectTo({ url: '/pages/daily/index' });
    } catch (e: any) {
      setError('星盘计算失败：' + (e.message || '请稍后再试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="input-page">
      <View className="logo-header">
        <Image
          className="cat-photo"
          src={catAvatar}
          mode="aspectFill"
        />
        <Text className="logo-title">木星小女巫</Text>
        <Text className="logo-subtitle">陪伴你的商业占星顾问</Text>
      </View>

      <Text className="page-title">输入出生信息</Text>
      <Text className="page-subtitle">木星需要这些信息来为你解读命运</Text>

      <View className="form-card">
        <View className="field-group">
          <Text className="field-label">姓名（可选）</Text>
          <Input
            className="field-input"
            placeholder="你的名字"
            value={name}
            onInput={e => setName(e.detail.value)}
          />
        </View>

        <View className="field-group">
          <Text className="field-label">出生年月日</Text>
          <View className="date-row">
            <Input className="field-input date-part" placeholder="年" type="number" value={year} onInput={e => setYear(e.detail.value)} />
            <Input className="field-input date-part" placeholder="月" type="number" value={month} onInput={e => setMonth(e.detail.value)} />
            <Input className="field-input date-part" placeholder="日" type="number" value={day} onInput={e => setDay(e.detail.value)} />
          </View>
        </View>

        <View className="field-group">
          <Text className="field-label">出生时间</Text>
          <View className="date-row">
            <Input className="field-input date-part" placeholder="时" type="number" value={hour} onInput={e => setHour(e.detail.value)} />
            <Input className="field-input date-part" placeholder="分" type="number" value={minute} onInput={e => setMinute(e.detail.value)} />
          </View>
        </View>

        <View className="field-group">
          <Text className="field-label">出生地点</Text>
          <Picker
            mode="region"
            value={region}
            onChange={handleRegionChange}
          >
            <View className="picker-display">
              <Text className={`picker-text${region[0] ? '' : ' picker-placeholder'}`}>
                {region[0] ? region.join(' ') : '请选择出生地点'}
              </Text>
              <Text className="picker-arrow">›</Text>
            </View>
          </Picker>
        </View>

        {error ? <Text className="error-text">{error}</Text> : null}

        <View className="astro-toggle" onClick={() => { setIncludeAstroTerms(!includeAstroTerms); Taro.setStorageSync('includeAstrologyTerms', !includeAstroTerms); }}>
          <View className={`toggle-switch ${includeAstroTerms ? 'toggle-on' : ''}`}>
            <View className="toggle-knob" />
          </View>
          <Text className="toggle-label">包含占星术语</Text>
        </View>

        <Button
          className="submit-btn"
          disabled={loading}
          onClick={handleSubmit}
        >
          {loading ? '计算星盘中...' : '开始解读 ✨'}
        </Button>
      </View>
    </View>
  );
}
