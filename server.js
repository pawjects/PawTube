const express = require('express');
const path = require('path');
const unifiedHandler = require('./api/unified');

const app = express();
const PORT = 3000;

app.all(['/api/unified', '/api/unified/*', '/api/extractor', '/api/extractor/*', '/api/media', '/api/media/*'], async (req, res) => {
  try {
    delete require.cache[require.resolve('./api/unified')];
    const handler = require('./api/unified');
    await handler(req, res);
  } catch (err) {
    console.error('Unified API Error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'docs')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
