/**
 * Secrets configuration and validation
 * Handles secure access to Cloudflare Workers secrets
 */

export interface SecretsConfig {
  enrollmentSecret: string;
  jwtSecret: string;
  webhookSecret: string;
  dbEncryptionKey: string;
  adminApiKey: string;
}

export interface Environment {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  SESSION_DO: DurableObjectNamespace;
  
  // Secrets
  ENROLLMENT_SECRET: string;
  JWT_SECRET: string;
  WEBHOOK_SECRET: string;
  DB_ENCRYPTION_KEY: string;
  ADMIN_API_KEY: string;
  ADMIN_PASSWORD: string;  // 管理员登录密码
  SERVER_PUBLIC_KEY?: string;  // 服务端公钥，可选
  
  // Environment variables
  ENVIRONMENT: string;
  API_VERSION: string;
  MAX_FILE_SIZE: string;
  SESSION_TIMEOUT: string;
  HEARTBEAT_INTERVAL: string;
  NONCE_WINDOW: string;
}

/**
 * Validates that all required secrets are present
 */
export function validateSecrets(env: Environment): SecretsConfig {
  const requiredSecrets = [
    'ENROLLMENT_SECRET',
    'JWT_SECRET', 
    'WEBHOOK_SECRET',
    'DB_ENCRYPTION_KEY',
    'ADMIN_API_KEY',
    'ADMIN_PASSWORD'  // 管理员密码
  ] as const;

  const missingSecrets: string[] = [];
  
  for (const secret of requiredSecrets) {
    if (!env[secret] || env[secret].trim() === '') {
      missingSecrets.push(secret);
    }
  }

  // In test or development environment, provide default values for missing secrets
  const isTestEnv = env.ENVIRONMENT === 'test' || process.env.NODE_ENV === 'test';
  const isDevEnv = env.ENVIRONMENT === 'development' || !env.ENVIRONMENT;
  
  if (missingSecrets.length > 0 && !isTestEnv && !isDevEnv) {
    throw new Error(
      `Missing required secrets: ${missingSecrets.join(', ')}. ` +
      `Please set these secrets using 'wrangler secret put <SECRET_NAME> --env <environment>'`
    );
  }

  return {
    enrollmentSecret: env.ENROLLMENT_SECRET || 'test-enrollment-secret-12345',
    jwtSecret: env.JWT_SECRET || 'test-jwt-secret-key-for-testing',
    webhookSecret: env.WEBHOOK_SECRET || 'test-webhook-secret-12345',
    dbEncryptionKey: env.DB_ENCRYPTION_KEY || 'test-db-encryption-key-32-chars-long-12345678',
    adminApiKey: env.ADMIN_API_KEY || 'test-admin-api-key-for-testing-12345',
  };
}

/**
 * Gets environment-specific configuration
 */
export function getEnvironmentConfig(env: Environment) {
  return {
    environment: env.ENVIRONMENT || 'development',
    apiVersion: env.API_VERSION || 'v1',
    maxFileSize: parseInt(env.MAX_FILE_SIZE || '10485760'), // 10MB default
    sessionTimeout: parseInt(env.SESSION_TIMEOUT || '1800'), // 30 minutes default
    heartbeatInterval: parseInt(env.HEARTBEAT_INTERVAL || '60'), // 60 seconds default
    nonceWindow: parseInt(env.NONCE_WINDOW || '300'), // 5 minutes default
  };
}

/**
 * Securely compares two strings to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Validates admin API key
 */
export function validateAdminApiKey(providedKey: string, secrets: SecretsConfig): boolean {
  if (!providedKey || !secrets.adminApiKey) {
    return false;
  }

  return secureCompare(providedKey, secrets.adminApiKey);
}

/**
 * Validates webhook signature
 */
export async function validateWebhookSignature(
  payload: string,
  signature: string,
  secrets: SecretsConfig
): Promise<boolean> {
  if (!signature || !secrets.webhookSecret) {
    return false;
  }

  try {
    // Remove 'sha256=' prefix if present
    const cleanSignature = signature.replace(/^sha256=/, '');
    
    // Calculate expected signature
    const encoder = new TextEncoder();
    const key = encoder.encode(secrets.webhookSecret);
    const data = encoder.encode(payload);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return secureCompare(cleanSignature, expectedSignature);
  } catch (error) {
    return false;
  }
}

/**
 * Encrypts sensitive data using the database encryption key
 */
export async function encryptData(data: string, secrets: SecretsConfig): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secrets.dbEncryptionKey);
  
  // Generate a random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Import the key
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.slice(0, 32), // Use first 32 bytes for AES-256
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Return base64 encoded result
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts sensitive data using the database encryption key
 */
export async function decryptData(encryptedData: string, secrets: SecretsConfig): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const keyData = encoder.encode(secrets.dbEncryptionKey);
    
    // Decode base64
    const combined = new Uint8Array(
      atob(encryptedData).split('').map(c => c.charCodeAt(0))
    );
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    // Import the key
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.slice(0, 32), // Use first 32 bytes for AES-256
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    // Decrypt the data
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error('Failed to decrypt data: ' + (error as Error).message);
  }
}

/**
 * Generates a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes a password or sensitive string
 */
export async function hashSensitiveData(data: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const saltBytes = salt ? encoder.encode(salt) : crypto.getRandomValues(new Uint8Array(16));
  const dataBytes = encoder.encode(data);
  
  // Combine salt and data
  const combined = new Uint8Array(saltBytes.length + dataBytes.length);
  combined.set(saltBytes);
  combined.set(dataBytes, saltBytes.length);
  
  // Hash the combined data
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Return salt + hash as hex string
  const saltHex = Array.from(saltBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
  
  return saltHex + ':' + hashHex;
}

/**
 * Verifies a hashed sensitive string
 */
export async function verifySensitiveData(data: string, hashedData: string): Promise<boolean> {
  try {
    const [saltHex, expectedHashHex] = hashedData.split(':');
    if (!saltHex || !expectedHashHex) {
      return false;
    }
    
    // Convert salt from hex
    const salt = saltHex.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || [];
    const saltBytes = new Uint8Array(salt);
    
    // Hash the provided data with the same salt
    const actualHash = await hashSensitiveData(data, new TextDecoder().decode(saltBytes));
    
    return secureCompare(actualHash, hashedData);
  } catch (error) {
    return false;
  }
}