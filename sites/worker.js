const HTML_ROUTES = new Set(['/', '/calendar', '/chores', '/expenses', '/fridge']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);

    if (assetResponse.status !== 404 || !['GET', 'HEAD'].includes(request.method)) {
      return assetResponse;
    }

    if (HTML_ROUTES.has(url.pathname)) {
      const htmlPath = url.pathname === '/' ? '/index.html' : `${url.pathname}.html`;
      return env.ASSETS.fetch(new Request(new URL(htmlPath, url), request));
    }

    if (!url.pathname.includes('.')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }

    return assetResponse;
  },
};
