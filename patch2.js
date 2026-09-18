const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const regex = /const data = await response\.json\(\);/;
const replacement = `
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error("Invalid JSON response from instance: " + text.slice(0, 50));
      }
`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.js', code);
