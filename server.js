const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from the 'docs' directory
app.use(express.static(path.join(__dirname, 'docs')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
