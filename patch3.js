const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const regex = /if \\(res\.status === 200 && res\.ok\\) \\{[\\s\\S]*?return true;\\s*\\}/;
const replacement = `
      if (res.status === 200 && res.ok) {
        const text = await res.text();
        try {
           const json = JSON.parse(text);
           if (json && json.software && json.software.name === "invidious") {
             this.instanceStatus.set(url, { healthy: true, latency, failures: 0, lastCheck: Date.now() });
             return true;
           }
        } catch (err) {}
      }
`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.js', code);
