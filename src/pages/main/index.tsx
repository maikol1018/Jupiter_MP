import { View, Text, Button, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { BirthData, NatalData, UserProfileRecord } from '../../types';
import Icon from '../../components/Icon';
import {
  getProfileCategories,
  getProfileRecords,
  ensureActiveProfileRecord,
  setActiveProfile,
  updateProfileCategory,
  deleteProfileRecord,
} from '../../services/profileService';
import './index.scss';

export default function MainPage() {
  const [birthConfig, setBirthConfig] = useState<BirthData | null>(null);
  const [natalData, setNatalData] = useState<NatalData | null>(null);
  const [profileRecords, setProfileRecords] = useState<UserProfileRecord[]>([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');

  // 每次页面显示时重新读取数据（从 input 页面返回后刷新）
  useDidShow(() => {
    const activeRecord = ensureActiveProfileRecord();
    const records = getProfileRecords();
    setProfileRecords(records);
    if (activeRecord) {
      setBirthConfig(activeRecord.birthConfig);
      setNatalData(activeRecord.natalData);
      setActiveProfileId(activeRecord.id);
    } else {
      Taro.redirectTo({ url: '/pages/input/index' });
    }
  });

  const categories = ['全部', ...getProfileCategories(profileRecords)];
  const visibleProfiles = categoryFilter === '全部'
    ? profileRecords
    : profileRecords.filter(record => (record.category || '自己') === categoryFilter);

  const handleSwitchProfile = (record: UserProfileRecord) => {
    setActiveProfile(record);
    setBirthConfig(record.birthConfig);
    setNatalData(record.natalData);
    setActiveProfileId(record.id);
    setShowProfilePanel(false);
    Taro.showToast({ title: '已切换主角', icon: 'none', duration: 1200 });
  };

  const handleEditCategory = (record: UserProfileRecord) => {
    setEditingCategoryId(record.id);
    setCategoryDraft(record.category || '');
  };

  const handleSaveCategory = (record: UserProfileRecord) => {
    const nextCategory = categoryDraft.trim();
    if (!nextCategory) {
      Taro.showToast({ title: '请输入分类名称', icon: 'none', duration: 1200 });
      return;
    }
    const records = updateProfileCategory(record.id, nextCategory);
    setProfileRecords(records);
    setEditingCategoryId('');
    setCategoryDraft('');
    Taro.showToast({ title: '分类已更新', icon: 'none', duration: 1200 });
  };

  const handleDeleteProfile = (record: UserProfileRecord) => {
    Taro.showModal({
      title: '删除档案',
      content: `确定要删除「${record.birthConfig.name || '神秘星人'}」吗？删除后无法恢复。`,
      confirmText: '删除',
      confirmColor: '#c04f45',
      cancelText: '取消',
      success: result => {
        if (!result.confirm) return;
        const { records, activeRecord } = deleteProfileRecord(record.id);
        setProfileRecords(records);
        setEditingCategoryId('');
        setCategoryDraft('');
        if (categoryFilter !== '全部' && !records.some(item => (item.category || '自己') === categoryFilter)) {
          setCategoryFilter('全部');
        }

        if (activeRecord) {
          setBirthConfig(activeRecord.birthConfig);
          setNatalData(activeRecord.natalData);
          setActiveProfileId(activeRecord.id);
          Taro.showToast({ title: record.id === activeProfileId ? '已删除并切换主角' : '档案已删除', icon: 'none', duration: 1400 });
          return;
        }

        Taro.showToast({ title: '档案已删除', icon: 'none', duration: 1200 });
        Taro.redirectTo({ url: '/pages/input/index' });
      },
    });
  };

  const handleAddProfile = () => {
    Taro.navigateTo({ url: '/pages/input/index' });
  };

  if (!birthConfig || !natalData) {
    return (
      <View className="main-loading">
        <Text className="loading-text">载入中...</Text>
      </View>
    );
  }

  const tabs = [
    { key: 'day', label: '每日运程', iconName: 'sun', url: '/packageA/pages/daily/index' },
    { key: 'consult', label: '遇事不决', iconName: 'compass', url: '/packageA/pages/consult/index' },
    { key: 'profile', label: '我的', iconName: 'user', url: '/packageA/pages/profile/index' },
  ];

  return (
    <View className="main-page">
      {/* 顶部用户信息 */}
      <View className="user-header">
        <View className="avatar-circle">
          <Icon name="star" size={30} color="#fff" />
        </View>
        <View className="user-info">
          <Text className="user-name">{birthConfig.name || '神秘星人'}</Text>
          <Text className="user-birth">
            {profileRecords.find(record => record.id === activeProfileId)?.category || '自己'} · {birthConfig.year}年{birthConfig.month}月{birthConfig.day}日 · {birthConfig.city}
          </Text>
        </View>
        <Button
          className="edit-btn"
          onClick={() => setShowProfilePanel(open => !open)}
        >
          变更主角
        </Button>
      </View>

      {showProfilePanel && (
        <View className="profile-panel">
          <View className="profile-panel-head">
            <Text className="profile-panel-title">档案记录</Text>
            <Button className="add-profile-btn" onClick={handleAddProfile}>新增档案</Button>
          </View>

          <View className="category-filter-row">
            {categories.map(category => (
              <View
                key={category}
                className={`category-filter-chip${categoryFilter === category ? ' category-filter-chip-active' : ''}`}
                onClick={() => setCategoryFilter(category)}
              >
                <Text>{category}</Text>
              </View>
            ))}
          </View>

          <View className="profile-record-list">
            {visibleProfiles.map(record => (
              <View
                key={record.id}
                className={`profile-record${record.id === activeProfileId ? ' profile-record-active' : ''}`}
              >
                <View className="profile-record-body" onClick={() => handleSwitchProfile(record)}>
                  <View className="profile-record-main">
                    <View className="profile-record-title-row">
                      <Text className="profile-record-name">{record.birthConfig.name || '神秘星人'}</Text>
                      <Text className="profile-record-tag">{record.category || '自己'}</Text>
                    </View>
                    <Text className="profile-record-meta">
                      {record.birthConfig.year}年{record.birthConfig.month}月{record.birthConfig.day}日 · {record.birthConfig.city}
                    </Text>
                  </View>
                  <View className="profile-record-actions">
                    <Text className="profile-record-status">{record.id === activeProfileId ? '当前' : '切换'}</Text>
                    <Button
                      className="category-edit-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleEditCategory(record);
                      }}
                    >
                      改分类
                    </Button>
                    <Button
                      className="profile-delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteProfile(record);
                      }}
                    >
                      删除
                    </Button>
                  </View>
                </View>

                {editingCategoryId === record.id && (
                  <View className="category-editor">
                    <Input
                      className="category-editor-input"
                      placeholder="朋友 / 家人 / 客户"
                      value={categoryDraft}
                      onInput={event => setCategoryDraft(event.detail.value)}
                    />
                    <Button className="category-save-btn" onClick={() => handleSaveCategory(record)}>保存</Button>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 功能入口 */}
      <View className="menu-grid">
        {tabs.map(tab => (
          <View
            key={tab.key}
            className="menu-item"
            onClick={() => Taro.navigateTo({ url: tab.url })}
          >
            <Icon name={tab.iconName} size={44} color="#c97b6e" />
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
          { label: '卜一卦', iconName: 'sparkle', url: '/packageA/pages/consult/index?tab=dice' },
          { label: '公司合盘', iconName: 'building', url: '/packageA/pages/consult/index?tab=company' },
          { label: '跳槽分析', iconName: 'rocket', url: '/packageA/pages/consult/index?tab=jobhop' },
          { label: '合伙人', iconName: 'handshake', url: '/packageA/pages/consult/index?tab=partner' },
        ].map(item => (
          <View
            key={item.label}
            className="sub-menu-item"
            onClick={() => Taro.navigateTo({ url: item.url })}
          >
              <Icon name={item.iconName} size={46} color="#c97b6e" />
            <Text className="sub-menu-label">{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
