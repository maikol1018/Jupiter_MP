import { Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { CSSProperties } from 'react';
import './index.scss';

interface IconProps {
  name: string;
  size?: number;       // rpx 单位，默认 40
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * 图标组件 — 封装 iconfont
 * 用法：<Icon name="sun" size={48} color="#c97b6e" />
 */
export default function Icon({ name, size, color, className = '', style = {} }: IconProps) {
  const mergedStyle: CSSProperties = {
    ...style,
  };
  if (size) mergedStyle.fontSize = Taro.pxTransform(size);
  if (color) mergedStyle.color = color;

  return (
    <Text
      className={`iconfont icon-${name} ${className}`}
      style={mergedStyle}
    />
  );
}
