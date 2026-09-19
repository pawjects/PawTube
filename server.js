const express = require('express');
const path = require('path');
const unifiedHandler = require('./api/unified');

const app = express();
const PORT = 3000;

app.all(['/api/unified', '/api/unified/*'], async (req, res) => {
  await unifiedHandler(req, res);
});

app.use(express.static(path.join(__dirname, 'docs')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
