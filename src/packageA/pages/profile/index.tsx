import { View, Text, Button, ScrollView, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import QRCode from 'qrcode';
import { BirthData, NatalData } from '../../../types';
import { REPORT_LOADING_HINT } from '../../../constants';
import { generateAnnualReport, generateInnerManualReport, getInnerManualPortrait } from '../../../services/geminiService';
import { ensureActiveProfileRecord } from '../../../services/profileService';
import ChatBox from '../../../components/ChatBox';
import Icon from '../../../components/Icon';
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

interface AnnualChatMsg { role: 'assistant' | 'user'; content: string }

const LAN_SHARE_APP_URL = 'http://192.168.0.11:5173/';

const getShareAppUrl = () => {
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/`;
  }
  return LAN_SHARE_APP_URL;
};

const loadCanvasImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = document.createElement('img');
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const drawRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const drawWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
) => {
  let line = '';
  let lineCount = 0;
  for (const char of text) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = char;
      lineCount += 1;
      if (lineCount >= maxLines) return;
    } else {
      line = testLine;
    }
  }
  if (line && lineCount < maxLines) ctx.fillText(line, x, y + lineCount * lineHeight);
};

const generatePortraitShareImage = async (
  portrait: ReturnType<typeof getInnerManualPortrait>,
  birthConfig: BirthData,
) => {
  if (typeof document === 'undefined') {
    throw new Error('当前环境暂不支持生成分享图');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建分享图画布');

  const shareAppUrl = getShareAppUrl();
  const qrDataUrl = await QRCode.toDataURL(shareAppUrl, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#3d1c0a', light: '#ffffff' },
  });
  const qrImage = await loadCanvasImage(qrDataUrl);

  const bg = ctx.createLinearGradient(0, 0, 900, 1200);
  bg.addColorStop(0, '#f7ede3');
  bg.addColorStop(0.55, '#fff9f2');
  bg.addColorStop(1, '#f2d8ca');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 900, 1200);

  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  drawRoundRect(ctx, 54, 56, 792, 1088, 46);
  ctx.fill();
  ctx.strokeStyle = 'rgba(185,110,80,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(201,123,110,0.32)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(450, 190, 104, 0, Math.PI * 2);
  ctx.stroke();

  const iconGradient = ctx.createLinearGradient(398, 138, 502, 242);
  iconGradient.addColorStop(0, '#c97b6e');
  iconGradient.addColorStop(1, '#e8a882');
  ctx.fillStyle = iconGradient;
  drawRoundRect(ctx, 398, 138, 104, 104, 20);
  ctx.fill();
  ctx.fillStyle = '#fffaf5';
  ctx.font = '700 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(portrait.symbol, 450, 192);

  ctx.fillStyle = 'rgba(61,28,10,0.48)';
  ctx.font = '400 34px sans-serif';
  ctx.fillText('我的内在使用说明', 450, 340);

  ctx.fillStyle = '#3d1c0a';
  ctx.font = '700 58px sans-serif';
  ctx.fillText(portrait.modeName, 450, 425);

  ctx.fillStyle = 'rgba(61,28,10,0.78)';
  ctx.font = '400 36px sans-serif';
  drawWrappedText(ctx, portrait.tone, 450, 500, 660, 52, 2);

  const metaY = 610;
  const metaWidth = 330;
  const metaGap = 26;
  const metaX1 = 450 - metaWidth - metaGap / 2;
  const metaX2 = 450 + metaGap / 2;
  [{ label: '节奏', value: portrait.rhythm, x: metaX1 }, { label: '场景', value: portrait.focus, x: metaX2 }].forEach(item => {
    ctx.fillStyle = 'rgba(255,255,255,0.74)';
    drawRoundRect(ctx, item.x, metaY, metaWidth, 154, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,110,80,0.18)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(61,28,10,0.42)';
    ctx.font = '400 28px sans-serif';
    ctx.fillText(item.label, item.x + metaWidth / 2, metaY + 44);
    ctx.fillStyle = '#7a3520';
    ctx.font = '700 34px sans-serif';
    drawWrappedText(ctx, item.value, item.x + metaWidth / 2, metaY + 94, metaWidth - 44, 42, 2);
  });

  const keywordY = 826;
  const keywordWidths = portrait.keywords.map(keyword => Math.max(112, ctx.measureText(keyword).width + 56));
  const totalKeywordWidth = keywordWidths.reduce((sum, width) => sum + width, 0) + (portrait.keywords.length - 1) * 18;
  let keywordX = (900 - totalKeywordWidth) / 2;
  portrait.keywords.forEach((keyword, index) => {
    const width = keywordWidths[index];
    ctx.fillStyle = 'rgba(201,123,110,0.16)';
    drawRoundRect(ctx, keywordX, keywordY, width, 58, 29);
    ctx.fill();
    ctx.fillStyle = '#7a3520';
    ctx.font = '700 28px sans-serif';
    ctx.fillText(keyword, keywordX + width / 2, keywordY + 30);
    keywordX += width + 18;
  });

  ctx.fillStyle = 'rgba(61,28,10,0.58)';
  ctx.font = '400 28px sans-serif';
  ctx.fillText(`${birthConfig.name || '我'}的主使用模式`, 450, 918);

  ctx.fillStyle = '#ffffff';
  drawRoundRect(ctx, 356, 944, 188, 188, 22);
  ctx.fill();
  ctx.drawImage(qrImage, 370, 958, 160, 160);

  ctx.fillStyle = '#3d1c0a';
  ctx.font = '700 26px sans-serif';
  ctx.fillText('扫码进入木星小女巫', 450, 1160);

  return canvas.toDataURL('image/png');
};

const downloadShareImage = (dataUrl: string) => {
  if (typeof document === 'undefined') {
    Taro.showToast({ title: '请长按图片保存', icon: 'none' });
    return;
  }
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = 'inner-manual-share.png';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function ProfilePage() {
  const [birthConfig, setBirthConfig] = useState<BirthData | null>(null);
  const [natalData, setNatalData] = useState<NatalData | null>(null);
  const [dataChecked, setDataChecked] = useState(false);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportCategory, setReportCategory] = useState('人生剧本');
  const [reportContent, setReportContent] = useState('');
  const [innerManualContent, setInnerManualContent] = useState('');
  const [innerManualLoading, setInnerManualLoading] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareGenerating, setShareGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [annualStep, setAnnualStep] = useState(0);

  const goInputPage = () => {
    Taro.reLaunch({ url: '/pages/input/index' }).catch(() => {
      Taro.redirectTo({ url: '/pages/input/index' });
    });
  };

  useDidShow(() => {
    try {
      const activeRecord = ensureActiveProfileRecord();
      if (activeRecord) {
        setBirthConfig(activeRecord.birthConfig);
        setNatalData(activeRecord.natalData);
      } else {
        Taro.showToast({ title: '请先填写出生资料', icon: 'none', duration: 1800 });
        setTimeout(goInputPage, 0);
      }
    } catch (err) {
      console.error('读取出生资料失败:', err);
      Taro.showToast({ title: '资料读取失败，请重试', icon: 'none', duration: 1800 });
    } finally {
      setDataChecked(true);
    }
  });

  const categories = ['人生剧本', '事业财富', '爱情感情', '健康身心', '人际贵人'];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];
  const innerPortrait = natalData ? getInnerManualPortrait(natalData) : null;
  const annualMessages: AnnualChatMsg[] = [
    { role: 'assistant', content: '希望木星与您回顾那一年呢？' },
  ];

  if (annualStep >= 1) {
    annualMessages.push(
      { role: 'user', content: `${reportYear}年` },
      { role: 'assistant', content: '这一年想重点看看什么主题？' },
    );
  }

  if (annualStep >= 2) {
    annualMessages.push(
      { role: 'user', content: reportCategory },
      { role: 'assistant', content: `收到，准备为你复盘 ${reportYear} 年的${reportCategory}。` },
    );
  }

  const handleYearChoose = (year: number) => {
    if (loading) return;
    setReportYear(year);
    setAnnualStep(1);
    setReportContent('');
  };

  const handleCategoryChoose = (category: string) => {
    if (loading) return;
    setReportCategory(category);
    setAnnualStep(2);
    setReportContent('');
  };

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

  const handleGenerateInnerManual = async () => {
    if (!birthConfig || !natalData || innerManualLoading) return;
    setInnerManualLoading(true);
    setInnerManualContent('');
    try {
      const astroTerms = !!Taro.getStorageSync('includeAstrologyTerms');
      const text = await generateInnerManualReport(natalData, birthConfig, astroTerms);
      setInnerManualContent(text);
    } catch (e: any) {
      setInnerManualContent('生成失败：' + (e.message || '请稍后再试'));
    } finally {
      setInnerManualLoading(false);
    }
  };

  const handleGenerateShareImage = async () => {
    if (!innerPortrait || !birthConfig || shareGenerating) return;
    setShareGenerating(true);
    try {
      const imageUrl = await generatePortraitShareImage(innerPortrait, birthConfig);
      setShareImageUrl(imageUrl);
      setShareModalOpen(true);
    } catch (e: any) {
      Taro.showToast({ title: e.message || '生成分享图失败', icon: 'none', duration: 1800 });
    } finally {
      setShareGenerating(false);
    }
  };

  if (!dataChecked || !birthConfig) {
    return (
      <View style={{ background: '#1a0a2e', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48rpx' }}>
        <View style={{ textAlign: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: '30rpx', display: 'block', marginBottom: '24rpx' }}>
            {!dataChecked ? '正在读取你的资料...' : '未找到出生资料，请先填写'}
          </Text>
          {dataChecked && (
            <Button onClick={goInputPage} style={{ background: '#c97b6e', color: '#fff', borderRadius: '999rpx', fontSize: '28rpx', padding: '0 28rpx' }}>
              去填写资料
            </Button>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="page-root">
      <ScrollView scrollY className="profile-page" style={{ paddingBottom: '140rpx' }}>
      {/* 用户信息 */}
      <View className="profile-header">
        <Text className="profile-name">{birthConfig.name || '神秘星人'}</Text>
        <Text className="profile-birth">{birthConfig.year}年{birthConfig.month}月{birthConfig.day}日 · {birthConfig.city}</Text>
      </View>

      {/* 内在使用说明 */}
      <View className="section-card inner-manual-section-card">
        <View className="section-title-row">
          <View>
            <Text className="section-title inner-title">内在使用说明</Text>
            <Text className="section-subtitle">从本命图理解你的天赋、惯性与关系模式</Text>
          </View>
          <View className="section-mark"><Icon name="sparkle" size={30} color="#c97b6e" /></View>
        </View>
        <Button className="gen-btn inner-gen-btn" disabled={innerManualLoading} onClick={handleGenerateInnerManual}>
          {innerManualLoading ? '生成中...' : innerManualContent ? '重新生成说明' : '查看内在使用说明'}
        </Button>
      </View>

      {(innerManualContent || innerManualLoading) && (
        <View className="inner-manual-output">
          {!innerManualLoading && innerPortrait && (
            <View className="portrait-card">
              <View className="portrait-orbit">
                <Text className="portrait-symbol">{innerPortrait.symbol}</Text>
              </View>
              <Text className="portrait-kicker">主使用模式</Text>
              <Text className="portrait-title">{innerPortrait.modeName}</Text>
              <Text className="portrait-tone">{innerPortrait.tone}</Text>
              <View className="portrait-meta-row">
                <View className="portrait-meta">
                  <Text className="portrait-meta-label">节奏</Text>
                  <Text className="portrait-meta-value">{innerPortrait.rhythm}</Text>
                </View>
                <View className="portrait-meta">
                  <Text className="portrait-meta-label">场景</Text>
                  <Text className="portrait-meta-value">{innerPortrait.focus}</Text>
                </View>
              </View>
              <View className="portrait-keywords">
                {innerPortrait.keywords.map(keyword => (
                  <Text key={keyword} className="portrait-keyword">{keyword}</Text>
                ))}
              </View>
            </View>
          )}

          {!innerManualLoading && innerPortrait && (
            <View className="share-action-card">
              <Button className="share-btn" disabled={shareGenerating} onClick={handleGenerateShareImage}>
                {shareGenerating ? '生成分享图中...' : '分享这张画像'}
              </Button>
              <Text className="share-hint">分享图会带上二维码，扫码进入木星小女巫</Text>
            </View>
          )}

          <View className="report-card inner-report-card">
            {innerManualLoading ? (
              <View className="loading-box">
                <Text className="loading-text">木星正在整理你的内在使用说明...</Text>
                <Text className="loading-hint">{REPORT_LOADING_HINT}</Text>
              </View>
            ) : (
              <View>
                {renderMarkdown(innerManualContent)}
                <View className="disclaimer-bar">
                  <Text className="disclaimer-text"><Icon name="sparkle" size={22} color="rgba(61,28,10,0.38)" /> 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 年度报告 */}
      <View className="section-card annual-section-card">
        <Text className="section-title">年度复盘分析</Text>

        <View className="chat-stream annual-chat-stream">
          {annualMessages.map((m, i) => (
            <View key={i} className={`chat-row chat-row-${m.role}`}>
              <View className={`chat-bubble chat-bubble-${m.role}`}>
                <Text className="chat-text">{m.content}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="chat-action">
          {annualStep === 0 && (
            <View className="action-card">
              <View className="quick-options">
                {years.map(y => (
                  <View key={y} className="quick-option" onClick={() => handleYearChoose(y)}>
                    <Text>{y}年</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {annualStep === 1 && (
            <View className="action-card">
              <View className="quick-options">
                {categories.map(c => (
                  <View key={c} className="quick-option" onClick={() => handleCategoryChoose(c)}>
                    <Text>{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {annualStep >= 2 && (
            <View className="action-card">
              <Button className="gen-btn" disabled={loading} onClick={handleGenerate}>
                {loading ? '生成中...' : reportContent ? '重新生成本分类' : '开始复盘'}
              </Button>
            </View>
          )}
        </View>
      </View>

      {/* 报告内容 */}
      {(reportContent || loading) && (
        <View className="report-card">
          {loading ? (
            <View className="loading-box">
              <Text className="loading-text">木星正在整理你的年度复盘...</Text>
              <Text className="loading-hint">{REPORT_LOADING_HINT}</Text>
            </View>
          ) : (
            <View>
              {renderMarkdown(reportContent)}
              <View className="disclaimer-bar">
                <Text className="disclaimer-text"><Icon name="sparkle" size={22} color="rgba(61,28,10,0.38)" /> 本报告仅供娱乐，不构成任何建议，请理性看待</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {reportContent && !loading && (
        <View className="section-card continue-section-card">
          <Text className="continue-title">继续查看其他分类</Text>
          <View className="quick-options">
            {categories.filter(category => category !== reportCategory).map(category => (
              <View key={category} className="quick-option" onClick={() => handleCategoryChoose(category)}>
                <Text>{category}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 问与答 */}
      {reportContent && !loading && (
        <ChatBox reportContent={reportContent} />
      )}
      </ScrollView>

      {shareModalOpen && shareImageUrl && (
        <View className="share-modal-mask" onClick={() => setShareModalOpen(false)}>
          <View className="share-modal" onClick={(event) => event.stopPropagation()}>
            <Text className="share-modal-title">画像分享图</Text>
            <Image className="share-preview" src={shareImageUrl} mode="widthFix" />
            <View className="share-modal-actions">
              <Button className="share-save-btn" onClick={() => downloadShareImage(shareImageUrl)}>保存图片</Button>
              <Button className="share-close-btn" onClick={() => setShareModalOpen(false)}>关闭</Button>
            </View>
            <Text className="share-modal-hint">H5 可下载保存；手机浏览器也可长按图片保存。</Text>
          </View>
        </View>
      )}

      {/* 底部导航栏 */}
      <View className="bottom-nav">
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/packageA/pages/daily/index' })}>
          <Icon name="sun" size={38} color="rgba(61,28,10,0.4)" />
          <Text className="nav-label">每日运程</Text>
        </View>
        <View className="nav-item" onClick={() => Taro.redirectTo({ url: '/packageA/pages/consult/index' })}>
          <Icon name="compass" size={38} color="rgba(61,28,10,0.4)" />
          <Text className="nav-label">遇事不决</Text>
        </View>
        <View className="nav-item nav-item-active">
          <Icon name="user" size={38} color="#7a3520" />
          <Text className="nav-label">我的</Text>
          <View className="nav-dot" />
        </View>
      </View>
    </View>
  );
}
