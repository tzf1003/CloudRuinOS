/**
 * 数据库迁移属性测试
 * Feature: lightweight-rmm, Property 4: 设备信息持久化
 * Validates: Requirements 1.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import { Device, CreateDeviceInput, UpdateDeviceInput } from '../types/database';

// Mock D1 database for testing
interface MockD1Database {
  prepare(query: string): MockD1PreparedStatement;
  exec(query: string): Promise<any>;
}

interface MockD1PreparedStatement {
  bind(...values: any[]): MockD1PreparedStatement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[]; success: boolean; meta: any }>;
  run(): Promise<{ success: boolean; meta: any }>;
}

// 创建内存数据库模拟器
class MockDatabase implements MockD1Database {
  private devices: Map<string, Device> = new Map();
  private nextId = 1;

  prepare(query: string): MockD1PreparedStatement {
    return new MockPreparedStatement(query, this);
  }

  async exec(query: string): Promise<any> {
    // 简单的 schema 创建模拟
    if (query.includes('CREATE TABLE')) {
      return { success: true };
    }
    return { success: false };
  }

  // 内部方法用于测试
  insertDevice(device: Device): void {
    this.devices.set(device.id, device);
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  updateDevice(id: string, updates: Partial<Device>): boolean {
    const device = this.devices.get(id);
    if (!device) return false;
    
    this.devices.set(id, { ...device, ...updates, updated_at: Date.now() });
    return true;
  }

  getAllDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  clear(): void {
    this.devices.clear();
  }
}

class MockPreparedStatement implements MockD1PreparedStatement {
  private boundValues: any[] = [];

  constructor(private query: string, private db: MockDatabase) {}

  bind(...values: any[]): MockD1PreparedStatement {
    this.boundValues = values;
    return this;
  }

  async first<T = any>(): Promise<T | null> {
    if (this.query.includes('SELECT') && this.query.includes('devices')) {
      const deviceId = this.boundValues[0];
      const device = this.db.getDevice(deviceId);
      return device as T || null;
    }
    return null;
  }

  async all<T = any>(): Promise<{ results: T[]; success: boolean; meta: any }> {
    if (this.query.includes('SELECT') && this.query.includes('devices')) {
      const devices = this.db.getAllDevices();
      return {
        results: devices as T[],
        success: true,
        meta: { duration: 1, rows_read: devices.length, rows_written: 0 }
      };
    }
    return { results: [], success: true, meta: { duration: 1, rows_read: 0, rows_written: 0 } };
  }

  async run(): Promise<{ success: boolean; meta: any }> {
    if (this.query.includes('INSERT INTO devices')) {
      const [id, enrollment_token, public_key, platform, version, last_seen, status, created_at, updated_at] = this.boundValues;
      const device: Device = {
        id, enrollment_token, public_key, platform, version, last_seen, status, created_at, updated_at
      };
      this.db.insertDevice(device);
      return { success: true, meta: { duration: 1, rows_read: 0, rows_written: 1 } };
    }
    
    if (this.query.includes('UPDATE devices')) {
      const deviceId = this.boundValues[this.boundValues.length - 1]; // 假设 ID 是最后一个参数
      const success = this.db.updateDevice(deviceId, {
        last_seen: this.boundValues[0],
        status: this.boundValues[1],
        updated_at: this.boundValues[2]
      });
      return { success, meta: { duration: 1, rows_read: 1, rows_written: success ? 1 : 0 } };
    }
    
    return { success: false, meta: { duration: 1, rows_read: 0, rows_written: 0 } };
  }
}

// 数据库操作类
class DeviceRepository {
  constructor(private db: MockD1Database) {}

  async createDevice(input: CreateDeviceInput): Promise<Device> {
    const now = Date.now();
    const device: Device = {
      ...input,
      last_seen: now,
      status: 'online',
      created_at: now,
      updated_at: now
    };

    const stmt = this.db.prepare(`
      INSERT INTO devices (id, enrollment_token, public_key, platform, version, last_seen, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = await stmt.bind(
      device.id,
      device.enrollment_token,
      device.public_key,
      device.platform,
      device.version,
      device.last_seen,
      device.status,
      device.created_at,
      device.updated_at
    ).run();

    if (!result.success) {
      throw new Error('Failed to create device');
    }

    return device;
  }

  async getDevice(id: string): Promise<Device | null> {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE id = ?');
    return await stmt.bind(id).first<Device>();
  }

  async updateDevice(id: string, updates: UpdateDeviceInput): Promise<boolean> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE devices 
      SET last_seen = ?, status = ?, updated_at = ?
      WHERE id = ?
    `);
    
    const result = await stmt.bind(
      updates.last_seen || now,
      updates.status || 'online',
      now,
      id
    ).run();

    return result.success;
  }

  async getAllDevices(): Promise<Device[]> {
    const stmt = this.db.prepare('SELECT * FROM devices ORDER BY created_at DESC');
    const result = await stmt.all<Device>();
    return result.results;
  }
}

// 测试数据生成器
const deviceIdArbitrary = fc.string({ minLength: 8, maxLength: 64 }).filter(s => s.trim().length > 0);
const publicKeyArbitrary = fc.string({ minLength: 44, maxLength: 44 }); // Ed25519 public key base64
const platformArbitrary = fc.constantFrom('windows', 'linux', 'macos');
const versionArbitrary = fc.string({ minLength: 5, maxLength: 20 }).filter(s => /^\d+\.\d+\.\d+/.test(s) || s.includes('v'));
// 修复：使用 fc.option() 但转换 null 为 undefined
const enrollmentTokenArbitrary = fc.option(fc.string({ minLength: 16, maxLength: 128 }), { nil: undefined });

const createDeviceInputArbitrary = fc.record({
  id: deviceIdArbitrary,
  enrollment_token: enrollmentTokenArbitrary,
  public_key: publicKeyArbitrary,
  platform: platformArbitrary,
  version: versionArbitrary
});

describe('Database Migration Property Tests', () => {
  let mockDb: MockDatabase;
  let deviceRepo: DeviceRepository;

  beforeAll(async () => {
    mockDb = new MockDatabase();
    deviceRepo = new DeviceRepository(mockDb);
    
    // 模拟数据库 schema 创建
    await mockDb.exec(`
      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        enrollment_token TEXT,
        public_key TEXT NOT NULL,
        platform TEXT NOT NULL,
        version TEXT NOT NULL,
        last_seen INTEGER NOT NULL,
        status TEXT DEFAULT 'online',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  });

  afterAll(() => {
    mockDb.clear();
  });

  describe('Property 4: 设备信息持久化', () => {
    it('should persist device information correctly for any valid device input', async () => {
      await fc.assert(
        fc.asyncProperty(createDeviceInputArbitrary, async (deviceInput) => {
          // 清理之前的测试数据
          mockDb.clear();
          
          // 创建设备
          const createdDevice = await deviceRepo.createDevice(deviceInput);
          
          // 验证创建的设备包含所有必需字段
          expect(createdDevice.id).toBe(deviceInput.id);
          expect(createdDevice.public_key).toBe(deviceInput.public_key);
          expect(createdDevice.platform).toBe(deviceInput.platform);
          expect(createdDevice.version).toBe(deviceInput.version);
          expect(createdDevice.enrollment_token).toBe(deviceInput.enrollment_token);
          expect(createdDevice.status).toBe('online');
          expect(typeof createdDevice.last_seen).toBe('number');
          expect(typeof createdDevice.created_at).toBe('number');
          expect(typeof createdDevice.updated_at).toBe('number');
          expect(createdDevice.created_at).toBeLessThanOrEqual(Date.now());
          expect(createdDevice.updated_at).toBeLessThanOrEqual(Date.now());
          
          // 验证可以从数据库中检索设备
          const retrievedDevice = await deviceRepo.getDevice(deviceInput.id);
          expect(retrievedDevice).not.toBeNull();
          expect(retrievedDevice).toEqual(createdDevice);
          
          // 验证设备在设备列表中
          const allDevices = await deviceRepo.getAllDevices();
          expect(allDevices).toHaveLength(1);
          expect(allDevices[0]).toEqual(createdDevice);
        }),
        { numRuns: 100 } // 运行 100 次迭代
      );
    });

    it('should handle device updates correctly for any valid device', async () => {
      await fc.assert(
        fc.asyncProperty(
          createDeviceInputArbitrary,
          fc.record({
            last_seen: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
            status: fc.option(fc.constantFrom('online', 'offline', 'error'), { nil: undefined }),
            version: fc.option(versionArbitrary, { nil: undefined })
          }),
          async (deviceInput, updateInput) => {
            // 清理之前的测试数据
            mockDb.clear();
            
            // 创建设备
            const originalDevice = await deviceRepo.createDevice(deviceInput);
            
            // 更新设备
            const updateSuccess = await deviceRepo.updateDevice(originalDevice.id, updateInput);
            expect(updateSuccess).toBe(true);
            
            // 验证更新后的设备
            const updatedDevice = await deviceRepo.getDevice(originalDevice.id);
            expect(updatedDevice).not.toBeNull();
            
            if (updatedDevice) {
              // 验证更新的字段
              if (updateInput.last_seen !== undefined) {
                expect(updatedDevice.last_seen).toBe(updateInput.last_seen);
              }
              if (updateInput.status !== undefined) {
                expect(updatedDevice.status).toBe(updateInput.status);
              }
              
              // 验证未更新的字段保持不变
              expect(updatedDevice.id).toBe(originalDevice.id);
              expect(updatedDevice.public_key).toBe(originalDevice.public_key);
              expect(updatedDevice.platform).toBe(originalDevice.platform);
              expect(updatedDevice.created_at).toBe(originalDevice.created_at);
              
              // 验证 updated_at 字段被更新
              expect(updatedDevice.updated_at).toBeGreaterThanOrEqual(originalDevice.updated_at);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain data integrity for multiple devices', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createDeviceInputArbitrary, { minLength: 1, maxLength: 10 }).filter(devices => {
            // 确保设备 ID 唯一
            const ids = devices.map(d => d.id);
            return new Set(ids).size === ids.length;
          }),
          async (deviceInputs) => {
            // 清理之前的测试数据
            mockDb.clear();
            
            // 创建所有设备
            const createdDevices: Device[] = [];
            for (const deviceInput of deviceInputs) {
              const device = await deviceRepo.createDevice(deviceInput);
              createdDevices.push(device);
            }
            
            // 验证所有设备都被正确存储
            const allDevices = await deviceRepo.getAllDevices();
            expect(allDevices).toHaveLength(deviceInputs.length);
            
            // 验证每个设备都可以单独检索
            for (const createdDevice of createdDevices) {
              const retrievedDevice = await deviceRepo.getDevice(createdDevice.id);
              expect(retrievedDevice).toEqual(createdDevice);
            }
            
            // 验证设备 ID 的唯一性
            const deviceIds = allDevices.map(d => d.id);
            expect(new Set(deviceIds).size).toBe(deviceIds.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});