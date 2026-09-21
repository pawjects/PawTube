const { sendResponse } = require('./_piped');

module.exports = async function handler(req, res) {
  sendResponse(res, 200, {
    status: 'ok',
    service: 'PawTube Vercel Serverless Gateway',
    timestamp: Date.now()
  });
};
