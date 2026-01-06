
import { Env } from '../../index';
import { verifyRequestIntegrity } from '../utils/crypto';
import { getDeviceById } from '../utils/database';
import { ConfigurationRow } from '../../database/schema';

// Helper: Deep Merge
function deepMerge(target: any, source: any): any {
  const isObject = (obj: any) => obj && typeof obj === 'object';
  
  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  Object.keys(source).forEach(key => {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      target[key] = sourceValue; // Arrays are replaced, not merged
    } else if (isObject(targetValue) && isObject(sourceValue)) {
      target[key] = deepMerge(Object.assign({}, targetValue), sourceValue);
    } else {
      target[key] = sourceValue;
    }
  });

  return target;
}

// ==================== Agent API ====================

export async function syncConfig(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any;
    const { device_id, timestamp, nonce, signature } = body;

    if (!device_id || !timestamp || !nonce || !signature) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    // 1. Get Device to retreive Public Key & Enrollment Token
    const device = await getDeviceById(env.DB, device_id);
    if (!device) {
      return new Response(JSON.stringify({ error: 'Device not found' }), { status: 404 });
    }

    // 2. Verify Signature
    const integrity = await verifyRequestIntegrity(
      device_id,
      timestamp,
      nonce,
      signature,
      device.public_key,
      {} // No additional data for now
    );

    if (!integrity.valid) {
      return new Response(JSON.stringify({ error: integrity.reason || 'Invalid signature' }), { status: 401 });
    }

    // 3. Fetch Configs from Database
    // We need: Global, Token (if exists), Device
    const stmt = env.DB.prepare(`
      SELECT scope, target_id, content
      FROM configurations
      WHERE scope = 'global'
         OR (scope = 'token' AND target_id = ?)
         OR (scope = 'device' AND target_id = ?)
      ORDER BY 
        CASE scope 
          WHEN 'global' THEN 1 
          WHEN 'token' THEN 2 
          WHEN 'device' THEN 3 
        END ASC
    `);

    const token = device.enrollment_token || 'default-token'; // Fallback to default token group if none
    const { results } = await stmt.bind(token, device_id).all<ConfigurationRow>();

    // 4. Merge Configs
    let finalConfig = {};
    
    // Sort logic is handled by SQL ORDER BY, so we just merge in order
    // Order: Global -> Token -> Device
    if (results) {
        for (const row of results) {
            try {
                const configContent = JSON.parse(row.content);
                finalConfig = deepMerge(finalConfig, configContent);
            } catch (e) {
                console.error(`Failed to parse config for ${row.scope}:${row.target_id}`, e);
            }
        }
    }

    return new Response(JSON.stringify({
        status: 'ok',
        config: finalConfig,
        version: Date.now() // Simple versioning for now
    }), {
        headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Config sync error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), { status: 500 });
  }
}

// ==================== Admin API ====================

export async function getConfigs(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let scope = url.searchParams.get('scope');
    if (scope === 'group') scope = 'token';

    // Support target as alias for target_id
    const targetId = url.searchParams.get('target_id') || url.searchParams.get('target');

    let query = 'SELECT * FROM configurations';
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (scope) {
        whereClauses.push('scope = ?');
        params.push(scope);
    }
    if (targetId) {
        whereClauses.push('target_id = ?');
        params.push(targetId);
    }
    
    if (whereClauses.length > 0) {
        query += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    try {
        const { results } = await env.DB.prepare(query).bind(...params).all();
        return new Response(JSON.stringify({ data: results }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}


export async function updateConfig(request: Request, env: Env): Promise<Response> {
    try {
        const body = await request.json() as any;
        // Support aliases: target->target_id, config->content, group->token
        let scope = body.scope;
        if (scope === 'group') scope = 'token';
        
        const target_id = body.target_id || body.target;
        const content = body.content || body.config;

        if (!scope || !content) {
             return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
        }
        
        // Scope validation
        if (!['global', 'token', 'device'].includes(scope)) {
             return new Response(JSON.stringify({ error: 'Invalid scope' }), { status: 400 });
        }
        
        // Target ID validation
        const targetId = scope === 'global' ? null : target_id;
        if (scope !== 'global' && !targetId) {
            return new Response(JSON.stringify({ error: 'target_id is required for non-global scope' }), { status: 400 });
        }

        // Validate content is valid JSON
        let contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        try {
            JSON.parse(contentStr); 
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Invalid JSON content' }), { status: 400 });
        }

        // Upsert
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(`
            INSERT INTO configurations (scope, target_id, content, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, 'admin')
            ON CONFLICT(scope, target_id) DO UPDATE SET
                content = excluded.content,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
        `).bind(scope, targetId, contentStr, now, now).run();

        return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
         return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

export async function deleteConfig(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    
    if(!id) return new Response(JSON.stringify({error: "Missing ID"}), {status: 400});

    try {
        await env.DB.prepare('DELETE FROM configurations WHERE id = ?').bind(id).run();
        return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
    } catch(e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
