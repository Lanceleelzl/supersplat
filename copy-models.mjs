import fs from 'fs';
import path from 'path';

// 确保 dist/static/public/model 目录存在并复制模型文件
const distModelDir = 'dist/static/public/model';
const staticModelDir = 'static/public/model';

// 创建目录（如果不存在）
if (!fs.existsSync(distModelDir)) {
    fs.mkdirSync(distModelDir, { recursive: true });
}

// 复制模型文件
const modelFile = 'marker.glb';
const srcPath = path.join(staticModelDir, modelFile);
const destPath = path.join(distModelDir, modelFile);

if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ 已复制模型文件: ${srcPath} -> ${destPath}`);
} else {
    console.error(`✗ 源文件不存在: ${srcPath}`);
}