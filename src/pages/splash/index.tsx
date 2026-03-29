import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useEffect } from 'react';
import './index.scss';

const lines = [
  "喵~",
  "我是一只拥有古老埃及血统的阿比西尼亚猫，我叫木星。\n我不吵闹，不粘人，只是安静的蹲在时光的边缘，听风告诉你宇宙的微光。",
  "今天第一次见到你，我已经轻轻的嗅到你接下来的运气。",
  "你有什么想问的吗？关于前路，关于心愿、关于那些你还不敢说出口的期待。",
  "我是木星，你的专属预言小猫。\n未来的答案我都知道。",
];

export default function SplashPage() {
  const [currentLine, setCurrentLine] = useState(0);
  const [showButton, setShowButton] = useState(false);

  // 检查是否已有用户数据，直接跳转到主页
  useEffect(() => {
    const saved = Taro.getStorageSync('birthConfig');
    if (saved) {
      Taro.redirectTo({ url: '/pages/main/index' });
      return;
    }
  }, []);

  useEffect(() => {
    if (currentLine < lines.length) {
      const t = setTimeout(() => setCurrentLine(prev => prev + 1), 4000);
      return () => clearTimeout(t);
    } else {
      setShowButton(true);
    }
  }, [currentLine]);

  return (
    <View className="splash-container">
      <View className="lines-container">
        {lines.slice(0, currentLine + 1).map((line, i) => (
          <Text key={i} className="splash-line">{line}</Text>
        ))}
      </View>
      {showButton && (
        <Button
          className="start-btn"
          onClick={() => Taro.navigateTo({ url: '/pages/input/index' })}
        >
          开始探索 ✨
        </Button>
      )}
    </View>
  );
}
