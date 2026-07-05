import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useEffect, useRef } from 'react';
import { PROXY_BASE_URL } from '../../services/apiService';
import './index.scss';

const lines = [
  "喵~",
  "我是一只拥有古老埃及血统的阿比西尼亚猫，我叫木星。\n我不吵闹，不粘人，只是安静的蹲在时光的边缘，听风告诉你宇宙的微光。",
  "今天第一次见到你，我已经轻轻的嗅到你接下来的运气。",
  "你有什么想问的吗？关于前路，关于心愿、关于那些你还不敢说出口的期待。",
  "我是木星，你的专属预言小猫。\n未来的答案我都知道。",
];

// 每行的最长停留时间（毫秒）—— 即使音频不响、不结束也强制推进，避免用户卡死
const LINE_FALLBACK_MS = [3500, 12000, 7000, 9000, 9000];

export default function SplashPage() {
  const [currentLine, setCurrentLine] = useState(-1);
  const [hasStarted, setHasStarted] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [showButton, setShowButton] = useState(false);
  const audioRef = useRef<any>(null);
  const fallbackTimerRef = useRef<any>(null);
  const typeTimerRef = useRef<any>(null);
  const advancedRef = useRef(false);

  function clearTypewriter() {
    if (typeTimerRef.current) {
      clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
    }
  }

  function clearFallback() {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  function stopAudio() {
    if (audioRef.current) {
      try {
        if (typeof audioRef.current.pause === 'function') audioRef.current.pause();
        if (typeof audioRef.current.stop === 'function') audioRef.current.stop();
        if (typeof audioRef.current.destroy === 'function') audioRef.current.destroy();
      } catch (_error) {}
      audioRef.current = null;
    }
  }

  function startTypewriter(index: number, durationMs: number) {
    const text = lines[index] || '';
    clearTypewriter();
    setDisplayedText('');

    if (!text) return;
    const startedAt = Date.now();
    const safeDuration = Math.max(durationMs - 350, 1200);

    typeTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(elapsed / safeDuration, 1);
      const nextLength = Math.max(1, Math.ceil(text.length * progress));
      setDisplayedText(text.slice(0, nextLength));
      if (progress >= 1) clearTypewriter();
    }, 80);
  }

  function setLineDuration(index: number, durationMs: number) {
    clearFallback();
    fallbackTimerRef.current = setTimeout(() => {
      goNext(index);
    }, durationMs);
    startTypewriter(index, durationMs);
  }

  function goNext(fromIndex: number) {
    if (advancedRef.current) return;
    advancedRef.current = true;
    clearFallback();
    clearTypewriter();
    stopAudio();
    const next = fromIndex + 1;
    if (next < lines.length) {
      setTimeout(() => setCurrentLine(next), 200);
    } else {
      setTimeout(() => setShowButton(true), 200);
    }
  }

  function speak(index: number) {
    advancedRef.current = false;
    clearFallback();
    clearTypewriter();
    setDisplayedText('');

    // 兜底超时：即便音频未加载/未触发回调，也按预设时长继续
    const fallbackMs = LINE_FALLBACK_MS[index] !== undefined ? LINE_FALLBACK_MS[index] : 8000;
    setLineDuration(index, fallbackMs);

    try {
      stopAudio();

      if (process.env.TARO_ENV === 'h5' && typeof Audio !== 'undefined') {
        const audio = new Audio(`${PROXY_BASE_URL}/audio/splash-${index}.mp3`);
        audioRef.current = audio;
        const onDone = () => {
          if (audioRef.current !== audio) return;
          goNext(index);
        };
        audio.addEventListener('loadedmetadata', () => {
          if (audioRef.current !== audio) return;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setLineDuration(index, audio.duration * 1000 + 450);
          }
        }, { once: true });
        audio.addEventListener('ended', onDone, { once: true });
        audio.addEventListener('error', onDone, { once: true });
        audio.play().catch(() => { /* 继续用文字和兜底时间推进 */ });
        return;
      }

      const ctx = Taro.createInnerAudioContext();
      audioRef.current = ctx;
      ctx.src = `${PROXY_BASE_URL}/audio/splash-${index}.mp3`;
      ctx.play();

      const onDone = () => {
        if (audioRef.current !== ctx) return;
        goNext(index);
      };
      ctx.onCanplay(() => {
        if (audioRef.current !== ctx) return;
        if (Number.isFinite(ctx.duration) && ctx.duration > 0) {
          setLineDuration(index, ctx.duration * 1000 + 450);
        }
      });
      ctx.onEnded(onDone);
      ctx.onError(onDone);
      ctx.onStop(onDone);
    } catch (_error) {
      // 即使创建/播放失败，超时兜底仍会推进
    }
  }

  // 跳过整段开场
  function handleSkipAll() {
    stopAudio();
    clearFallback();
    clearTypewriter();
    Taro.navigateTo({ url: '/pages/input/index' });
  }

  function startWelcome() {
    if (hasStarted) return;
    setHasStarted(true);
    setShowButton(false);
    setCurrentLine(0);
  }

  // 检查是否已有用户数据，直接跳转到主页
  useEffect(() => {
    const saved = Taro.getStorageSync('birthConfig');
    if (saved) {
      Taro.redirectTo({ url: '/pages/main/index' });
      return;
    }
    return () => {
      clearFallback();
      clearTypewriter();
      stopAudio();
    };
  }, []);

  useEffect(() => {
    if (hasStarted && currentLine >= 0 && currentLine < lines.length) {
      speak(currentLine);
    }
  }, [currentLine, hasStarted]);

  return (
    <View className="splash-container">
      {/* 始终显示跳过，避免卡死 */}
      {!showButton && (
        <View
          className="splash-skip"
          onClick={(e: any) => { e.stopPropagation && e.stopPropagation(); handleSkipAll(); }}
        >
          <Text>略过</Text>
        </View>
      )}

      {!hasStarted ? (
        <View className="welcome-panel">
          <Text className="welcome-title">木星小女巫</Text>
          <Text className="welcome-subtitle">戴上耳机，听木星向你打招呼</Text>
          <Button className="sound-btn" onClick={startWelcome}>开启旅程</Button>
        </View>
      ) : (
        <View className="lines-container">
          {currentLine > 0 && lines.slice(0, currentLine).map((line, i) => (
            <Text key={i} className="splash-line splash-line-done">{line}</Text>
          ))}
          {currentLine >= 0 && currentLine < lines.length && (
            <Text className="splash-line splash-line-current">{displayedText}</Text>
          )}
        </View>
      )}

      {/* 提示用户可以点击继续 */}
      {!showButton && hasStarted && currentLine >= 0 && currentLine < lines.length && (
        <Text className="splash-hint">木星正在说话...</Text>
      )}

      {showButton && (
        <Button
          className="start-btn"
          onClick={(e: any) => { e.stopPropagation && e.stopPropagation(); Taro.navigateTo({ url: '/pages/input/index' }); }}
        >
          开始探索
        </Button>
      )}
    </View>
  );
}
