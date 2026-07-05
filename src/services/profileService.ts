import Taro from '@tarojs/taro';
import { BirthData, NatalData, UserProfileRecord } from '../types';
import { calculateProfessionalData } from './astroService';

const PROFILE_RECORDS_KEY = 'profileRecords';
const ACTIVE_PROFILE_ID_KEY = 'activeProfileId';
const ASTRO_CALC_VERSION = 'city-coords-v3';

export const DEFAULT_PROFILE_CATEGORIES = ['自己', '朋友', '家人', '客户'];

const createProfileId = () => `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const getDefaultCategory = (category?: string) => {
  const value = category?.trim();
  return value || DEFAULT_PROFILE_CATEGORIES[0];
};

const setProfileRecords = (records: UserProfileRecord[]) => {
  Taro.setStorageSync(PROFILE_RECORDS_KEY, records);
};

const CITY_COORD_FIXES: Record<string, { lat: number; lon: number }> = {
  '赤峰市': { lat: 42.2578, lon: 118.8869 },
};

const normalizeBirthConfig = (birthConfig: BirthData) => {
  const city = birthConfig.city || '';
  const fixKey = Object.keys(CITY_COORD_FIXES).find(key => city.includes(key));
  if (!fixKey) return birthConfig;

  const coords = CITY_COORD_FIXES[fixKey];
  if (Math.abs(birthConfig.lat - coords.lat) < 0.0001 && Math.abs(birthConfig.lon - coords.lon) < 0.0001) {
    return birthConfig;
  }

  return { ...birthConfig, lat: coords.lat, lon: coords.lon };
};

const refreshProfileRecord = (record: UserProfileRecord) => {
  const birthConfig = normalizeBirthConfig(record.birthConfig);
  if (record.astroCalcVersion === ASTRO_CALC_VERSION && birthConfig === record.birthConfig) return record;
  return {
    ...record,
    birthConfig,
    natalData: calculateProfessionalData(birthConfig),
    astroCalcVersion: ASTRO_CALC_VERSION,
    updatedAt: Date.now(),
  };
};

export const getProfileRecords = (): UserProfileRecord[] => {
  try {
    const saved = Taro.getStorageSync(PROFILE_RECORDS_KEY);
    if (!Array.isArray(saved)) return [];
    let changed = false;
    const records = saved.filter(Boolean).map(record => {
      const refreshed = refreshProfileRecord(record);
      if (refreshed !== record) changed = true;
      return refreshed;
    });
    if (changed) setProfileRecords(records);
    return records;
  } catch (_error) {
    return [];
  }
};

export const setActiveProfile = (record: UserProfileRecord) => {
  Taro.setStorageSync(ACTIVE_PROFILE_ID_KEY, record.id);
  Taro.setStorageSync('birthConfig', record.birthConfig);
  Taro.setStorageSync('natalData', record.natalData);
};

export const saveProfileRecord = (
  birthConfig: BirthData,
  natalData: NatalData,
  category?: string,
) => {
  const now = Date.now();
  const normalizedBirthConfig = normalizeBirthConfig(birthConfig);
  const normalizedNatalData = normalizedBirthConfig === birthConfig
    ? natalData
    : calculateProfessionalData(normalizedBirthConfig);
  const record: UserProfileRecord = {
    id: createProfileId(),
    category: getDefaultCategory(category),
    birthConfig: normalizedBirthConfig,
    natalData: normalizedNatalData,
    astroCalcVersion: ASTRO_CALC_VERSION,
    createdAt: now,
    updatedAt: now,
  };
  const records = getProfileRecords();
  const nextRecords = [record, ...records];
  setProfileRecords(nextRecords);
  setActiveProfile(record);
  return record;
};

export const updateProfileCategory = (profileId: string, category: string) => {
  const nextCategory = getDefaultCategory(category);
  const records = getProfileRecords().map(record => (
    record.id === profileId
      ? { ...record, category: nextCategory, updatedAt: Date.now() }
      : record
  ));
  setProfileRecords(records);
  const activeId = Taro.getStorageSync(ACTIVE_PROFILE_ID_KEY);
  const active = records.find(record => record.id === activeId);
  if (active) setActiveProfile(active);
  return records;
};

export const deleteProfileRecord = (profileId: string) => {
  const activeId = Taro.getStorageSync(ACTIVE_PROFILE_ID_KEY);
  const records = getProfileRecords().filter(record => record.id !== profileId);
  setProfileRecords(records);

  if (activeId === profileId) {
    const nextActive = records[0] || null;
    if (nextActive) {
      setActiveProfile(nextActive);
      return { records, activeRecord: nextActive };
    }

    Taro.removeStorageSync(ACTIVE_PROFILE_ID_KEY);
    Taro.removeStorageSync('birthConfig');
    Taro.removeStorageSync('natalData');
    return { records, activeRecord: null };
  }

  const activeRecord = records.find(record => record.id === activeId) || records[0] || null;
  if (activeRecord && activeRecord.id !== activeId) setActiveProfile(activeRecord);
  return { records, activeRecord };
};

export const ensureActiveProfileRecord = () => {
  const records = getProfileRecords();
  const activeId = Taro.getStorageSync(ACTIVE_PROFILE_ID_KEY);
  const activeRecord = records.find(record => record.id === activeId);
  if (activeRecord) {
    setActiveProfile(activeRecord);
    return activeRecord;
  }

  const birthConfig: BirthData | null = Taro.getStorageSync('birthConfig');
  const natalData: NatalData | null = Taro.getStorageSync('natalData');
  if (birthConfig && natalData) {
    const now = Date.now();
    const normalizedBirthConfig = normalizeBirthConfig(birthConfig);
    const migrated: UserProfileRecord = {
      id: activeId || createProfileId(),
      category: DEFAULT_PROFILE_CATEGORIES[0],
      birthConfig: normalizedBirthConfig,
      natalData: calculateProfessionalData(normalizedBirthConfig),
      astroCalcVersion: ASTRO_CALC_VERSION,
      createdAt: now,
      updatedAt: now,
    };
    const nextRecords = [migrated, ...records];
    setProfileRecords(nextRecords);
    setActiveProfile(migrated);
    return migrated;
  }

  if (records[0]) {
    setActiveProfile(records[0]);
    return records[0];
  }

  return null;
};

export const getProfileCategories = (records: UserProfileRecord[]) => {
  const categories = new Set(DEFAULT_PROFILE_CATEGORIES);
  records.forEach(record => categories.add(getDefaultCategory(record.category)));
  return Array.from(categories);
};