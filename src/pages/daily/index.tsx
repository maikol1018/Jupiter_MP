import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { BirthData, NatalData } from '../../types';
import { generateDailyWorkReport } from '../../services/geminiService';
import './index.scss';

// 简单的 Markdown 转普通文本渲染（小程序不支持 DOM）
function renderMarkdown(text: string) {
  if (!text) return [];
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // 处理 **粗体**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const isH1 = line.startsWith('# ');
    const isH2 = line.startsWith('## ');
    const isH3 = line.startsWith('### ');
    const isBullet = line.startsWith('- ') || line.startsWith('▸ ');
    const cleanLine = line.replace(/^#{1,3}\s/, '').replace(/^[-▸]\s/, '');

    if (!line.trim()) return <View key={i} className="md-spacer" />;

    if (isH1) return (
      <View key={i} className="md-h1"><Text>{cleanLine}</Text></View>
    );
    if (isH2) return (
      <View key={i} className="md-h2"><Text>{cleanLine}</Text></View>
    );
    if (isH3) return (
      <View key={i} className="md-h3">
        <Text className="md-h3-bullet">◆ </Text>
        <Text>{cleanLine}</Text>
      </View>
    );
    if (isBullet) return (
      <View key={i} className="md-bullet">
        <Text className="md-bullet-dot">▸ </Text>
        <Text className="md-bullet-text">{cleanLine}</Text>
      </View>
    );

    // 普通段落，处理粗体
    return (
      <View key={i} className="md-p">
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <Text key={j} className="md-bold">{part.slice(2, -2)}</Text>;
          }
          return <Text key={j}>{part}</Text>;
        })}
      </View>
    );
  });
}

export default function DailyPage() {
  const [currentIndex, setCurrentIndex] = useState(0); // 0=今日, 1=明日
  const [todayReport, setTodayReport] = useState('');
  const [tomorrowReport, setTomorrowReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const formatDate = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;

  const loadReport = async (date: Date, isToday: boolean) => {
    const bc: BirthData = Taro.getStorageSync('birthConfig');
    const nd: NatalData = Taro.getStorageSync('natalData');
    if (!bc || !nd) { Taro.redirectTo({ url: '/pages/input/index' }); return; }

    setLoading(true);
    setError('');
    try {
      const astroTerms = !!Taro.getStorageSync('includeAstrologyTerms');
      const text = await generateDailyWorkReport(nd, bc, astroTerms, date);
      if (isToday) setTodayReport(text);
      else setTomorrowReport(text);
    } catch (e: any) {
      setError('生成失败：' + (e.message || '请稍后再试'));
    } finally {
      setLoading(false);
    }
  };

  useLoad(() => {
    loadReport(now, true);
  });

  const handleTabChange = (idx: number) => {
    setCurrentIndex(idx);
    if (idx === 1 && !tomorrowReport) {
      loadReport(tomorrow, false);
    }
  };

  const currentReport = currentIndex === 0 ? todayReport : tomorrowReport;
  const currentDate = currentIndex === 0 ? now : tomorrow;

  return (
    <View className="page-root">
      <ScrollView scrollY className="daily-page" style={{ paddingBottom: '140rpx' }}>
      {/* 日期切换 Tab */}
      <View className="date-tabs">
        <View
          className={`date-tab ${currentIndex === 0 ? 'date-tab-active' : ''}`}
          onClick={() => handleTabChange(0)}
        >
          <Text>今日 · {formatDate(now)}</Text>
        </View>
        <View
          className={`date-tab ${currentIndex === 1 ? 'date-tab-active' : ''}`}
          onClick={() => handleTabChange(1)}
        >
          <Text>明日 · {formatDate(tomorrow)}</Text>
        </View>
      </View>

      {/* 报告内容 */}
      <View className="report-card">
        {loading ? (
          <View className="loading-container">
            <Text className="loading-icon spinning">✦</Text>
            <Text className="loading-text">木星正在观测星象...</Text>
          </View>
        ) : error ? (
          <View className="error-container">
            <Text className="error-text">{error}</Text>
            <Button className="retry-btn" onClick={() => loadReport(currentDate, currentIndex === 0)}>
              重新获取
            </Button>
          </View>
        ) : currentReport ? (
          <View className="markdown-content">
            {renderMarkdown(currentReport)}
          </View>
        ) : (
          <View className="loading-container">
            <Text className="loading-text">准备中...</Text>
          </View>
        )}
        {currentReport && (
          <View className="disclaimer-bar">
            <Text className="disclaimer-text">✨ 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
          </View>
        )}
      </View>

      {/* 深度解读入口 */}
      <View
        className="deep-btn-row"
        onClick={() => Taro.navigateTo({ url: '/pages/profile/index?tab=core' })}
      >
        <Text className="deep-btn-icon">🔒</Text>
        <Text className="deep-btn-text">深度星象解读</Text>
        <Text className="deep-btn-arrow">›</Text>
      </View>
      </ScrollView>

      {/* 底部导航栏 */}
      <View className="bottom-nav">
        <View className="nav-item nav-item-active">
          <Text className="nav-icon">☀️</Text>
          <Text className="nav-label">每日运程</Text>
          <View className="nav-dot" />
        </View>
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/pages/consult/index' })}>
          <Text className="nav-icon">🧭</Text>
          <Text className="nav-label">遇事不决</Text>
        </View>
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/pages/profile/index' })}>
          <Text className="nav-icon">👤</Text>
          <Text className="nav-label">我的</Text>
        </View>
      </View>
    </View>
  );
}
