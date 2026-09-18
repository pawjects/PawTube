const urls = [
  'https://invidious.f5.si/api/v1/trending?region=US',
  'https://inv.nadeko.net/api/v1/trending?region=US',
  'https://invidious.tiekoetter.com/api/v1/trending?region=US'
];

async function fetchAny() {
  const promises = urls.map(async url => {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { url, data };
  });
  try {
    const result = await Promise.any(promises);
    console.log('Success from:', result.url, result.data.length, 'items');
  } catch (e) {
    console.log('All failed', e.errors);
  }
}
fetchAny();
