import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { BirthData, NatalData } from '../../types';
import { generateAnnualReport } from '../../services/geminiService';
import './index.scss';

function renderMarkdown(text: string) {
  if (!text) return [];
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    if (!line.trim()) return <View key={i} style={{ height: '16rpx' }} />;
    if (line.startsWith('# ')) return (
      <View key={i} style={{ borderLeft: '6rpx solid #c97b6e', paddingLeft: '20rpx', margin: '24rpx 0 12rpx' }}>
        <Text style={{ fontSize: '34rpx', fontWeight: '700', color: '#7a3520' }}>{line.slice(2)}</Text>
      </View>
    );
    if (line.startsWith('## ')) return (
      <View key={i} style={{ background: 'rgba(185,110,80,0.1)', borderLeft: '5rpx solid #b96e50', padding: '10rpx 20rpx', borderRadius: '0 10rpx 10rpx 0', margin: '20rpx 0 10rpx' }}>
        <Text style={{ fontSize: '32rpx', fontWeight: '700', color: '#3d1c0a' }}>{line.slice(3)}</Text>
      </View>
    );
    if (line.startsWith('- ') || line.startsWith('▸ ')) return (
      <View key={i} style={{ display: 'flex', alignItems: 'flex-start', margin: '6rpx 0' }}>
        <Text style={{ color: '#c97b6e', marginRight: '10rpx', fontSize: '26rpx' }}>▸ </Text>
        <Text style={{ fontSize: '30rpx', color: 'rgba(61,28,10,0.85)', lineHeight: '1.9', flex: 1 }}>{line.replace(/^[-▸]\s/, '')}</Text>
      </View>
    );
    return (
      <View key={i} style={{ margin: '6rpx 0', lineHeight: '1.9' }}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <Text key={j} style={{ fontWeight: '700', color: '#3d1c0a', background: 'rgba(185,110,80,0.15)', padding: '0 4rpx', borderRadius: '4rpx' }}>{p.slice(2, -2)}</Text>
            : <Text key={j} style={{ fontSize: '30rpx', color: 'rgba(61,28,10,0.85)' }}>{p}</Text>
        )}
      </View>
    );
  });
}

export default function ProfilePage() {
  const [birthConfig, setBirthConfig] = useState<BirthData | null>(null);
  const [natalData, setNatalData] = useState<NatalData | null>(null);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportCategory, setReportCategory] = useState('综合运势');
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading] = useState(false);

  useDidShow(() => {
    const bc = Taro.getStorageSync('birthConfig');
    const nd = Taro.getStorageSync('natalData');
    if (bc && nd) { setBirthConfig(bc); setNatalData(nd); }
    else Taro.redirectTo({ url: '/pages/input/index' });
  });

  const categories = ['综合运势', '事业财富', '爱情感情', '健康身心', '人际贵人'];
  const years = [new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2];

  const handleGenerate = async () => {
    if (!birthConfig || !natalData) return;
    setLoading(true);
    setReportContent('');
    try {
      const astroTerms = !!Taro.getStorageSync('includeAstrologyTerms');
      const text = await generateAnnualReport(natalData, birthConfig, reportCategory, reportYear, astroTerms);
      setReportContent(text);
    } catch (e: any) {
      setReportContent('生成失败：' + (e.message || '请稍后再试'));
    } finally {
      setLoading(false);
    }
  };

  if (!birthConfig) return <View style={{ background: '#1a0a2e', minHeight: '100vh' }} />;

  return (
    <View className="page-root">
      <ScrollView scrollY className="profile-page" style={{ paddingBottom: '140rpx' }}>
      {/* 用户信息 */}
      <View className="profile-header">
        <Text className="profile-name">{birthConfig.name || '神秘星人'}</Text>
        <Text className="profile-birth">{birthConfig.year}年{birthConfig.month}月{birthConfig.day}日 · {birthConfig.city}</Text>
      </View>

      {/* 年度报告 */}
      <View className="section-card">
        <Text className="section-title">📖 年度人生剧本</Text>

        <Text className="field-label">选择年份</Text>
        <View className="chips-row">
          {years.map(y => (
            <View key={y} className={`chip ${reportYear === y ? 'chip-active' : ''}`} onClick={() => setReportYear(y)}>
              <Text>{y}年</Text>
            </View>
          ))}
        </View>

        <Text className="field-label" style={{ marginTop: '24rpx' }}>分析主题</Text>
        <View className="chips-row">
          {categories.map(c => (
            <View key={c} className={`chip ${reportCategory === c ? 'chip-active' : ''}`} onClick={() => setReportCategory(c)}>
              <Text>{c}</Text>
            </View>
          ))}
        </View>

        <Button className="gen-btn" disabled={loading} onClick={handleGenerate}>
          {loading ? '生成中...' : `生成 ${reportYear}年 ${reportCategory} 报告`}
        </Button>
      </View>

      {/* 报告内容 */}
      {(reportContent || loading) && (
        <View className="report-card">
          {loading ? (
            <View className="loading-box">
              <Text className="loading-text">木星正在撰写你的人生剧本...</Text>
            </View>
          ) : (
            <View>
              {renderMarkdown(reportContent)}
              <View className="disclaimer-bar">
                <Text className="disclaimer-text">✨ 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
              </View>
            </View>
          )}
        </View>
      )}
      </ScrollView>

      {/* 底部导航栏 */}
      <View className="bottom-nav">
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/pages/daily/index' })}>
          <Text className="nav-icon">☀️</Text>
          <Text className="nav-label">每日运程</Text>
        </View>
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/pages/consult/index' })}>
          <Text className="nav-icon">🧭</Text>
          <Text className="nav-label">遇事不决</Text>
        </View>
        <View className="nav-item nav-item-active">
          <Text className="nav-icon">👤</Text>
          <Text className="nav-label">我的</Text>
          <View className="nav-dot" />
        </View>
      </View>
    </View>
  );
}
