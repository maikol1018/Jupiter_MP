/**
 * Iconfont 字体转换脚本
 * 将从 iconfont.cn 下载的字体包转为小程序可用的 SCSS
 *
 * 用法：
 *   1. 在 iconfont.cn 下载字体包，解压到 src/assets/iconfont/raw/ 目录
 *   2. 运行 node scripts/gen-iconfont-scss.js
 *   3. 自动生成 src/assets/iconfont/iconfont.scss
 */

const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '..', 'src', 'assets', 'iconfont', 'raw');
const OUTPUT = path.join(__dirname, '..', 'src', 'assets', 'iconfont', 'iconfont.scss');

// 查找 TTF 文件
const ttfFile = fs.readdirSync(RAW_DIR).find(f => f.endsWith('.ttf'));
if (!ttfFile) {
  console.error('❌ 未找到 .ttf 文件，请确认已将 iconfont 字体包解压到 src/assets/iconfont/raw/');
  process.exit(1);
}

// 读取 TTF 并转 base64
const ttfPath = path.join(RAW_DIR, ttfFile);
const ttfBase64 = fs.readFileSync(ttfPath).toString('base64');
console.log(`✅ 读取字体文件: ${ttfFile} (${(fs.statSync(ttfPath).size / 1024).toFixed(1)} KB)`);

// 解析 iconfont.css 获取图标映射
const cssFile = fs.readdirSync(RAW_DIR).find(f => f.endsWith('.css'));
const iconMap = [];

if (cssFile) {
  const cssContent = fs.readFileSync(path.join(RAW_DIR, cssFile), 'utf-8');
  // 匹配 .icon-xxx:before { content: "\eXXX"; }
  const regex = /\.(icon-[\w-]+):before\s*\{\s*content:\s*"\\([a-fA-F0-9]+)";\s*\}/g;
  let match;
  while ((match = regex.exec(cssContent)) !== null) {
    iconMap.push({ className: match[1], unicode: match[2] });
  }
  console.log(`✅ 解析图标映射: ${iconMap.length} 个图标`);
} else {
  // 尝试从 iconfont.json 解析
  const jsonFile = fs.readdirSync(RAW_DIR).find(f => f.endsWith('.json'));
  if (jsonFile) {
    const json = JSON.parse(fs.readFileSync(path.join(RAW_DIR, jsonFile), 'utf-8'));
    if (json.glyphs) {
      json.glyphs.forEach(g => {
        iconMap.push({ className: `icon-${g.font_class}`, unicode: g.unicode });
      });
      console.log(`✅ 从 JSON 解析图标映射: ${iconMap.length} 个图标`);
    }
  }
}

// 生成 SCSS
let scss = `// ============================================
// Iconfont 图标字体 - 自动生成，请勿手动修改
// 生成时间: ${new Date().toISOString()}
// ============================================

@font-face {
  font-family: 'iconfont';
  src: url('data:font/truetype;charset=utf-8;base64,${ttfBase64}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

.iconfont {
  font-family: 'iconfont' !important;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

`;

// 添加每个图标的类
iconMap.forEach(({ className, unicode }) => {
  scss += `.${className}::before { content: "\\${unicode}"; }\n`;
});

fs.writeFileSync(OUTPUT, scss, 'utf-8');
console.log(`✅ 已生成: ${OUTPUT}`);
console.log('');
console.log('图标列表:');
iconMap.forEach(({ className, unicode }) => {
  console.log(`  .${className}  →  \\${unicode}`);
});
