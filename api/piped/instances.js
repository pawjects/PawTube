const { DEFAULT_INSTANCES, instanceStats, sendResponse } = require('../_piped');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Custom-Instance');
    res.statusCode = 204;
    res.end();
    return;
  }

  const list = DEFAULT_INSTANCES.map((url) => {
    const stats = instanceStats.get(url) || {};
    return {
      url,
      healthy: !stats.cooldownUntil || Date.now() > stats.cooldownUntil,
      latency: stats.latency || 0,
      lastSuccess: stats.lastSuccess || 0,
      failures: stats.consecutiveFailures || 0
    };
  });

  sendResponse(res, 200, {
    instances: list,
    count: list.length,
    timestamp: Date.now()
  });
};
