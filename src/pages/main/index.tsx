import { View, Text, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { BirthData, NatalData } from '../../types';
import './index.scss';

export default function MainPage() {
  const [birthConfig, setBirthConfig] = useState<BirthData | null>(null);
  const [natalData, setNatalData] = useState<NatalData | null>(null);

  // 每次页面显示时重新读取数据（从 input 页面返回后刷新）
  useDidShow(() => {
    const bc = Taro.getStorageSync('birthConfig');
    const nd = Taro.getStorageSync('natalData');
    if (bc && nd) {
      setBirthConfig(bc);
      setNatalData(nd);
    } else {
      Taro.redirectTo({ url: '/pages/input/index' });
    }
  });

  if (!birthConfig || !natalData) {
    return (
      <View className="main-loading">
        <Text className="loading-text">载入中...</Text>
      </View>
    );
  }

  const tabs = [
    { key: 'day', label: '每日运程', icon: '☀️', url: '/pages/daily/index' },
    { key: 'consult', label: '遇事不决', icon: '🧭', url: '/pages/consult/index' },
    { key: 'profile', label: '我的', icon: '👤', url: '/pages/profile/index' },
  ];

  return (
    <View className="main-page">
      {/* 顶部用户信息 */}
      <View className="user-header">
        <View className="avatar-circle">
          <Text className="avatar-text">✦</Text>
        </View>
        <View className="user-info">
          <Text className="user-name">{birthConfig.name || '神秘星人'}</Text>
          <Text className="user-birth">
            {birthConfig.year}年{birthConfig.month}月{birthConfig.day}日 · {birthConfig.city}
          </Text>
        </View>
        <Button
          className="edit-btn"
          onClick={() => Taro.navigateTo({ url: '/pages/input/index' })}
        >
          编辑
        </Button>
      </View>

      {/* 功能入口 */}
      <View className="menu-grid">
        {tabs.map(tab => (
          <View
            key={tab.key}
            className="menu-item"
            onClick={() => Taro.navigateTo({ url: tab.url })}
          >
            <Text className="menu-icon">{tab.icon}</Text>
            <Text className="menu-label">{tab.label}</Text>
          </View>
        ))}
      </View>

      {/* 快速入口：遇事不决子模块 */}
      <View className="section-title-row">
        <Text className="section-title">遇事不决</Text>
      </View>
      <View className="sub-menu-grid">
        {[
          { label: '公司合盘', icon: '🏢', url: '/pages/consult/index?tab=company' },
          { label: '跳槽分析', icon: '🚀', url: '/pages/consult/index?tab=jobhop' },
          { label: '合伙人', icon: '🤝', url: '/pages/consult/index?tab=partner' },
        ].map(item => (
          <View
            key={item.label}
            className="sub-menu-item"
            onClick={() => Taro.navigateTo({ url: item.url })}
          >
            <Text className="sub-menu-icon">{item.icon}</Text>
            <Text className="sub-menu-label">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
