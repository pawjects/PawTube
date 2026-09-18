const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const regex = /this\.instanceStatus\.set\(url, \{ healthy: true, latency, failures: 0, lastCheck: Date\.now\(\) \}\);/g;
const replacement = `
             const existing = this.instanceStatus.get(url) || {};
             this.instanceStatus.set(url, { ...existing, healthy: true, latency, lastCheck: Date.now() });
`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.js', code);
