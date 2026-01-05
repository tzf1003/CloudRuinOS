/**
 * CORS 中间件
 * 处理跨域请求头
 */

/**
 * 获取允许的源列表
 */
function getAllowedOrigins(env: any): string[] {
  const origins: string[] = [];

  // 添加默认允许的源
  origins.push('*'); // 允许所有源（可以根据需要限制）

  // 如果配置了 CONSOLE_URL，添加到允许列表
  if (env.CONSOLE_URL) {
    origins.push(env.CONSOLE_URL);
  }

  // 如果配置了 SERVER_URL，也添加（用于本地开发）
  if (env.SERVER_URL) {
    try {
      const url = new URL(env.SERVER_URL);
      origins.push(url.origin);
    } catch (e) {
      // 忽略无效的 URL
    }
  }

  return origins;
}

/**
 * 检查请求源是否被允许
 */
function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) return true; // 无 origin 的请求（如同源请求）默认允许

  // 如果允许所有源
  if (allowedOrigins.includes('*')) return true;

  // 检查是否在允许列表中
  return allowedOrigins.some(allowed => {
    if (allowed === '*') return true;
    if (allowed === origin) return true;

    // 支持通配符子域名 (如 *.example.com)
    if (allowed.startsWith('*.')) {
      const domain = allowed.substring(2);
      return origin.endsWith(domain);
    }

    return false;
  });
}

export function addCorsHeaders(response: Response, request?: Request, env?: any): Response {
  // 创建新的响应对象，添加 CORS 头
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  // 获取请求的 origin
  const origin = request?.headers.get('Origin');
  const allowedOrigins = env ? getAllowedOrigins(env) : ['*'];

  // 检查是否允许该源
  if (isOriginAllowed(origin, allowedOrigins)) {
    // 如果有具体的 origin，返回该 origin；否则返回 *
    if (origin && !allowedOrigins.includes('*')) {
      newResponse.headers.set('Access-Control-Allow-Origin', origin);
      newResponse.headers.set('Vary', 'Origin');
    } else {
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
    }
  } else {
    // 不允许的源，不设置 CORS 头
    return newResponse;
  }

  // 添加其他 CORS 头
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  newResponse.headers.set('Access-Control-Allow-Credentials', 'true');
  newResponse.headers.set('Access-Control-Max-Age', '86400');

  return newResponse;
}

/**
 * 处理 OPTIONS 预检请求
 */
export function handleOptionsRequest(request?: Request, env?: any): Response {
  const origin = request?.headers.get('Origin');
  const allowedOrigins = env ? getAllowedOrigins(env) : ['*'];

  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };

  // 检查是否允许该源
  if (isOriginAllowed(origin, allowedOrigins)) {
    if (origin && !allowedOrigins.includes('*')) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Vary'] = 'Origin';
    } else {
      headers['Access-Control-Allow-Origin'] = '*';
    }
  }

  return new Response(null, {
    status: 204,
    headers,
  });
}

/**
 * CORS 中间件函数
 */
export function corsMiddleware(handler: Function) {
  return async (request: Request, env: any, ctx: any) => {
    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return handleOptionsRequest(request, env);
    }

    // 执行原始处理器
    const response = await handler(request, env, ctx);

    // 添加 CORS 头到响应
    return addCorsHeaders(response, request, env);
  };
}