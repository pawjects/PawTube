const instancesHandler = require('./piped/instances');

module.exports = async function handler(req, res) {
  return instancesHandler(req, res);
};
