import { View, Text, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { askReportQuestion } from '../../services/geminiService';
import './index.scss';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatBoxProps {
  reportContent: string;
}

function renderMarkdown(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const isH1 = line.startsWith('# ');
    const isH2 = line.startsWith('## ');
    const isH3 = line.startsWith('### ');
    const isBullet = line.startsWith('- ') || line.startsWith('▸ ');
    const cleanLine = line.replace(/^#{1,3}\s/, '').replace(/^[-▸]\s/, '');

    if (!line.trim()) return <View key={i} className="md-spacer" />;
    if (isH3) return (
      <View key={i} className="md-h3">
        <Text className="md-h3-bullet">◆ </Text>
        <Text>{cleanLine}</Text>
      </View>
    );
    if (isH2) return (
      <View key={i} className="md-h2"><Text>{cleanLine}</Text></View>
    );
    if (isH1) return (
      <View key={i} className="md-h1"><Text>{cleanLine}</Text></View>
    );
    if (isBullet) return (
      <View key={i} className="md-bullet">
        <Text className="md-bullet-dot">▸ </Text>
        <Text className="md-bullet-text">{cleanLine}</Text>
      </View>
    );

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

export default function ChatBox({ reportContent }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const q = inputValue.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: q };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue('');
    setLoading(true);

    try {
      const astroTerms = !!Taro.getStorageSync('includeAstrologyTerms');
      const answer = await askReportQuestion(reportContent, q, astroTerms);
      setMessages([...newMessages, { role: 'assistant', content: answer }]);
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: '回答失败，请重试：' + (e.message || '') }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="chatbox-container">
      <View className="chatbox-header">
        <View className="chatbox-title-row">
          <Text className="chatbox-title">问与答</Text>
          <Text className="chatbox-ai-badge">AI生成</Text>
        </View>
        <Text className="chatbox-subtitle">本功能为深度合成 + AI问答，回答内容由AI生成，仅供娱乐参考。</Text>
      </View>

      {messages.length > 0 && (
        <View className="chatbox-messages">
          {messages.map((msg, i) => (
            <View key={i} id={`msg-${i}`} className={`chatbox-msg chatbox-msg-${msg.role}`}>
              <View className={`chatbox-bubble chatbox-bubble-${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <View>
                    <Text className="chatbox-message-ai-badge">AI生成</Text>
                    <View className="markdown-content">{renderMarkdown(msg.content)}</View>
                  </View>
                ) : (
                  <Text className="chatbox-text">{msg.content}</Text>
                )}
              </View>
            </View>
          ))}
          {loading && (
            <View className="chatbox-msg chatbox-msg-assistant">
              <View className="chatbox-bubble chatbox-bubble-assistant">
                <Text className="chatbox-typing">木星思考中...</Text>
              </View>
            </View>
          )}
        </View>
      )}

      <View className="chatbox-input-row">
        <Input
          className="chatbox-input"
          value={inputValue}
          onInput={e => setInputValue(e.detail.value)}
          placeholder="输入问题，AI将基于报告回答..."
          confirmType="send"
          onConfirm={handleSend}
          disabled={loading}
        />
        <View className={`chatbox-send ${(!inputValue.trim() || loading) ? 'chatbox-send-disabled' : ''}`} onClick={handleSend}>
          <Text className="chatbox-send-text">发送</Text>
        </View>
      </View>
    </View>
  );
}
