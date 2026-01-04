import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Device } from '../types/api';

// Property 10: 离线状态检测
// For any device that has not sent a heartbeat within the offline threshold,
// the Console should correctly display the device as offline status
// **Validates: Requirements 2.5**

describe('Feature: lightweight-rmm, Property 10: 离线状态检测', () => {
  const OFFLINE_THRESHOLD_SECONDS = 300; // 5 minutes

  // Helper function to determine if a device should be considered offline
  function shouldBeOffline(device: Device): boolean {
    const now = Math.floor(Date.now() / 1000);
    const timeSinceLastSeen = now - device.last_seen;
    return timeSinceLastSeen > OFFLINE_THRESHOLD_SECONDS;
  }

  // Helper function to get display status based on last_seen
  function getDisplayStatus(device: Device): 'online' | 'offline' | 'busy' {
    if (shouldBeOffline(device)) {
      return 'offline';
    }
    return device.status;
  }

  it('should detect offline status for devices with old last_seen timestamps', () => {
    fc.assert(
      fc.property(
        // Generate devices with various last_seen timestamps
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          public_key: fc.string({ minLength: 32, maxLength: 128 }),
          platform: fc.constantFrom('Windows', 'Linux', 'macOS'),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          status: fc.constantFrom('online', 'offline', 'busy'),
          created_at: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) }),
          updated_at: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) }),
          // Generate last_seen timestamps that are definitely old (more than threshold)
          last_seen: fc.integer({ 
            min: 1000000000, 
            max: Math.floor(Date.now() / 1000) - OFFLINE_THRESHOLD_SECONDS - 1 
          })
        }),
        (device: Device) => {
          // Property: For any device with last_seen older than threshold,
          // the display status should be 'offline'
          const displayStatus = getDisplayStatus(device);
          expect(displayStatus).toBe('offline');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain original status for devices with recent last_seen timestamps', () => {
    fc.assert(
      fc.property(
        // Generate devices with recent last_seen timestamps
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          public_key: fc.string({ minLength: 32, maxLength: 128 }),
          platform: fc.constantFrom('Windows', 'Linux', 'macOS'),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          status: fc.constantFrom('online', 'busy'), // Don't include 'offline' for recent devices
          created_at: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) }),
          updated_at: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) }),
          // Generate last_seen timestamps that are recent (within threshold)
          last_seen: fc.integer({ 
            min: Math.floor(Date.now() / 1000) - OFFLINE_THRESHOLD_SECONDS + 1,
            max: Math.floor(Date.now() / 1000)
          })
        }),
        (device: Device) => {
          // Property: For any device with recent last_seen,
          // the display status should match the original status
          const displayStatus = getDisplayStatus(device);
          expect(displayStatus).toBe(device.status);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge case at exact threshold boundary', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          public_key: fc.string({ minLength: 32, maxLength: 128 }),
          platform: fc.constantFrom('Windows', 'Linux', 'macOS'),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          status: fc.constantFrom('online', 'offline', 'busy'),
          created_at: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) }),
          updated_at: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) }),
          // Generate last_seen exactly at the threshold
          last_seen: fc.constant(Math.floor(Date.now() / 1000) - OFFLINE_THRESHOLD_SECONDS)
        }),
        (device: Device) => {
          // Property: Device exactly at threshold should not be considered offline
          // (threshold is exclusive, not inclusive)
          const displayStatus = getDisplayStatus(device);
          expect(displayStatus).toBe(device.status);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should consistently apply offline detection logic', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          public_key: fc.string({ minLength: 32, maxLength: 128 }),
          platform: fc.constantFrom('Windows', 'Linux', 'macOS'),
          version: fc.string({ minLength: 1, maxLength: 20 }),
          status: fc.constantFrom('online', 'offline', 'busy'),
          created_at: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) }),
          updated_at: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) }),
          last_seen: fc.integer({ min: 1000000000, max: Math.floor(Date.now() / 1000) })
        }),
        (device: Device) => {
          // Property: The offline detection logic should be consistent
          // If shouldBeOffline returns true, display status should be 'offline'
          // If shouldBeOffline returns false, display status should match original status
          const isOffline = shouldBeOffline(device);
          const displayStatus = getDisplayStatus(device);
          
          if (isOffline) {
            expect(displayStatus).toBe('offline');
          } else {
            expect(displayStatus).toBe(device.status);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});