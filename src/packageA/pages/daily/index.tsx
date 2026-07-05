import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { useState } from 'react';
import { BirthData, NatalData } from '../../../types';
import { REPORT_LOADING_HINT } from '../../../constants';
import { generateDailyWorkReport, getCachedDailyWorkReport } from '../../../services/geminiService';
import { ensureActiveProfileRecord } from '../../../services/profileService';
import ChatBox from '../../../components/ChatBox';
import Icon from '../../../components/Icon';
import './index.scss';

// 简单的 Markdown 转普通文本渲染（小程序不支持 DOM）
function renderMarkdown(text: string) {
  if (!text) return [];
  const lines = text.split('\n');
  const cleanReasonPrefix = (value: string) => value.replace(/^\s*(理由|原因)\s*[：:]\s*/, '');
  let currentSection: 'soul' | 'dress' | '' = '';

  const getSectionTitle = (value: string) => {
    const normalized = value.replace(/\*/g, '').replace(/^#{1,3}\s*/, '').trim();
    if (normalized === '心灵气象站' || normalized === '穿衣指南') return normalized;
    return '';
  };

  const renderInline = (value: string) => {
    const parts = value.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <Text key={j} className="md-bold">{part.slice(2, -2)}</Text>;
      }
      return <Text key={j}>{part}</Text>;
    });
  };

  return lines.map((line, i) => {
    const sectionTitle = getSectionTitle(line);
    const isH1 = line.startsWith('# ');
    const isH2 = line.startsWith('## ');
    const isH3 = line.startsWith('### ');
    const isBullet = line.startsWith('- ') || line.startsWith('▸ ') || line.startsWith('* ');
    const cleanLine = cleanReasonPrefix(line.replace(/^#{1,3}\s/, '').replace(/^[-▸*]\s/, ''));

    if (!line.trim()) return <View key={i} className="md-spacer" />;

    if (sectionTitle) {
      currentSection = sectionTitle === '心灵气象站' ? 'soul' : 'dress';
      return (
        <View key={i} className={`md-h2 daily-section-title daily-section-${currentSection}`}>
          <Text>{sectionTitle}</Text>
        </View>
      );
    }

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
      <View key={i} className={`md-bullet ${currentSection === 'dress' ? 'md-dress-bullet' : ''}`}>
        <Text className="md-bullet-dot">▸ </Text>
        <Text className="md-bullet-text">{renderInline(cleanLine)}</Text>
      </View>
    );

    // 普通段落，处理粗体
    const isSoulMood = currentSection === 'soul' && /^今日心情\s*[：:]/.test(cleanLine);
    return (
      <View key={i} className={`md-p ${currentSection === 'soul' ? (isSoulMood ? 'md-soul-mood' : 'md-soul-line') : ''}`}>
        {renderInline(cleanLine)}
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
    const existingReport = isToday ? todayReport : tomorrowReport;
    if (existingReport) {
      setError('');
      return;
    }

    const activeRecord = ensureActiveProfileRecord();
    const bc: BirthData | undefined = activeRecord?.birthConfig;
    const nd: NatalData | undefined = activeRecord?.natalData;
    if (!bc || !nd) { Taro.redirectTo({ url: '/pages/input/index' }); return; }

    const astroTerms = !!Taro.getStorageSync('includeAstrologyTerms');
    const cached = getCachedDailyWorkReport(bc, astroTerms, date);
    if (cached) {
      setError('');
      if (isToday) setTodayReport(cached);
      else setTomorrowReport(cached);
      return;
    }

    setLoading(true);
    setError('');
    try {
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
    const targetReport = idx === 0 ? todayReport : tomorrowReport;
    if (targetReport) {
      setError('');
      return;
    }
    loadReport(idx === 0 ? now : tomorrow, idx === 0);
  };

  const currentReport = currentIndex === 0 ? todayReport : tomorrowReport;
  const currentDate = currentIndex === 0 ? now : tomorrow;

  return (
    <View className="page-root">
      <ScrollView scrollY className="daily-page" style={{ paddingBottom: '112rpx' }}>
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
            <Icon name="star" size={44} color="#c97b6e" className="spinning" />
            <Text className="loading-text">每日气象...</Text>
            <Text className="loading-hint">{REPORT_LOADING_HINT}</Text>
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
            <Text className="disclaimer-text"><Icon name="sparkle" size={22} color="rgba(61,28,10,0.38)" /> 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
          </View>
        )}
      </View>

      {/* 问与答 */}
      {currentReport && !loading && (
        <ChatBox reportContent={currentReport} />
      )}

      </ScrollView>

      {/* 底部导航栏 */}
      <View className="bottom-nav">
        <View className="nav-item nav-item-active">
          <Icon name="sun" size={34} color="#7a3520" />
          <Text className="nav-label">每日运程</Text>
          <View className="nav-dot" />
        </View>
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/packageA/pages/consult/index' })}>
          <Icon name="compass" size={34} color="rgba(61,28,10,0.4)" />
          <Text className="nav-label">遇事不决</Text>
        </View>
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/packageA/pages/profile/index' })}>
          <Icon name="user" size={34} color="rgba(61,28,10,0.4)" />
          <Text className="nav-label">我的</Text>
        </View>
      </View>
    </View>
  );
}
