/**
 * CORS 中间件
 * 处理跨域请求头
 */

export function addCorsHeaders(response: Response): Response {
  // 创建新的响应对象，添加 CORS 头
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  // 添加 CORS 头
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  newResponse.headers.set('Access-Control-Max-Age', '86400');

  return newResponse;
}

/**
 * 处理 OPTIONS 预检请求
 */
export function handleOptionsRequest(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * CORS 中间件函数
 */
export function corsMiddleware(handler: Function) {
  return async (request: Request, env: any, ctx: any) => {
    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return handleOptionsRequest();
    }

    // 执行原始处理器
    const response = await handler(request, env, ctx);
    
    // 添加 CORS 头到响应
    return addCorsHeaders(response);
  };
}