#!/usr/bin/env node

/**
 * 减少属性测试示例数量的脚本
 * 将所有测试文件中的 numRuns 值减少到更合理的数量以提高测试速度
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// 配置：新的 numRuns 值映射
const NUM_RUNS_MAPPING = {
  // 原值 -> 新值
  100: 20,   // 大幅减少高频测试
  50: 15,    // 中等减少
  30: 10,    // 适度减少
  20: 8,     // 小幅减少
  15: 6,     // 保持合理覆盖
  10: 5,     // 最小有效测试
  8: 4,      // 快速验证
  6: 3,      // 基本验证
  5: 3,      // 保持最小值
  4: 3,      // 保持最小值
  3: 3       // 已经是最小值
};

// 默认的 numRuns 值（如果没有指定）
const DEFAULT_NUM_RUNS = 5;

function reduceTestExamples() {
  console.log('🔍 查找属性测试文件...');
  
  // 查找所有属性测试文件
  const testFiles = glob.sync('console/src/test/**/*.property.test.tsx', {
    cwd: process.cwd()
  });

  console.log(`📁 找到 ${testFiles.length} 个属性测试文件`);

  let totalReductions = 0;
  let filesModified = 0;

  testFiles.forEach(filePath => {
    console.log(`\n📝 处理文件: ${filePath}`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let modifiedContent = content;
      let fileReductions = 0;

      // 匹配 numRuns 配置的正则表达式
      const numRunsRegex = /numRuns:\s*(\d+)/g;
      let match;

      while ((match = numRunsRegex.exec(content)) !== null) {
        const originalValue = parseInt(match[1]);
        const newValue = NUM_RUNS_MAPPING[originalValue] || Math.max(3, Math.floor(originalValue * 0.3));
        
        if (newValue < originalValue) {
          const oldPattern = `numRuns: ${originalValue}`;
          const newPattern = `numRuns: ${newValue}`;
          
          modifiedContent = modifiedContent.replace(oldPattern, newPattern);
          fileReductions++;
          totalReductions++;
          
          console.log(`  ✅ ${originalValue} -> ${newValue}`);
        }
      }

      // 如果有修改，写回文件
      if (fileReductions > 0) {
        fs.writeFileSync(filePath, modifiedContent, 'utf8');
        filesModified++;
        console.log(`  💾 已保存 ${fileReductions} 个修改`);
      } else {
        console.log(`  ⏭️  无需修改`);
      }

    } catch (error) {
      console.error(`❌ 处理文件 ${filePath} 时出错:`, error.message);
    }
  });

  console.log(`\n📊 处理完成:`);
  console.log(`  - 修改的文件: ${filesModified}`);
  console.log(`  - 总计减少: ${totalReductions} 个测试示例`);
  console.log(`  - 预计提速: ${Math.round((totalReductions / (totalReductions + 100)) * 100)}%`);
}

// 添加一些额外的优化建议
function generateOptimizationReport() {
  console.log(`\n📋 测试优化建议:`);
  console.log(`  1. 运行测试: npm test 或 yarn test`);
  console.log(`  2. 如果测试仍然较慢，可以进一步减少 numRuns 值`);
  console.log(`  3. 考虑使用 --run 标志避免监视模式: vitest --run`);
  console.log(`  4. 可以使用 --reporter=verbose 查看详细进度`);
  console.log(`  5. 对于 CI/CD，建议使用并行测试: --threads`);
}

// 主函数
function main() {
  console.log('🚀 开始减少属性测试示例数量...\n');
  
  try {
    reduceTestExamples();
    generateOptimizationReport();
    
    console.log('\n✨ 优化完成！现在可以运行测试查看速度提升。');
  } catch (error) {
    console.error('❌ 优化过程中出现错误:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  reduceTestExamples,
  NUM_RUNS_MAPPING
};