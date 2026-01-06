#!/usr/bin/env node

/**
 * 数据库迁移脚本
 * 用于将 SQL 迁移文件应用到 D1 数据库
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 获取命令行参数
const args = process.argv.slice(2);
const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'development';
const dryRun = args.includes('--dry-run');

console.log(`🚀 开始数据库迁移 (环境: ${environment})`);

if (dryRun) {
    console.log('📋 干运行模式 - 仅显示将要执行的 SQL，不会实际执行');
}

// 读取迁移文件
const migrationsDir = join(__dirname, '../migrations');
const migrationFiles = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // 按文件名排序确保顺序执行

console.log(`📁 发现 ${migrationFiles.length} 个迁移文件:`);
migrationFiles.forEach(file => console.log(`   - ${file}`));

// 执行迁移
for (const file of migrationFiles) {
    const filePath = join(migrationsDir, file);
    const sql = readFileSync(filePath, 'utf-8');
    
    console.log(`\n📄 处理迁移文件: ${file}`);
    
    if (dryRun) {
        console.log('SQL 内容:');
        console.log('─'.repeat(50));
        console.log(sql);
        console.log('─'.repeat(50));
    } else {
        const dbName = environment === 'production' ? 'ruinos-db-prod' : environment === 'test' ? 'ruinos-db-test' : 'ruinos-db-local';
        console.log('💡 提示: 请使用以下命令执行此迁移:');
        console.log(`   wrangler d1 execute ${dbName} --file=${filePath}${environment !== 'development' ? ` --env=${environment}` : ''}`);
    }
}

if (!dryRun) {
    console.log('\n📝 迁移脚本完成。请手动执行上述 wrangler 命令来应用迁移。');
    console.log('💡 建议先在测试环境验证迁移，然后再应用到生产环境。');
    console.log('\n示例命令:');
    console.log('  # 开发环境');
    console.log('  wrangler d1 execute rmm-db --file=server/migrations/0001_initial_schema.sql');
    console.log('  # 测试环境');
    console.log('  wrangler d1 execute rmm-db-test --file=server/migrations/0001_initial_schema.sql --env=test');
    console.log('  # 生产环境');
    console.log('  wrangler d1 execute rmm-db-prod --file=server/migrations/0001_initial_schema.sql --env=production');
}