const urls = [
  'https://inv.nadeko.net/api/v1/trending?region=US',
  'https://invidious.nerdvpn.de/api/v1/trending?region=US',
  'https://invidious.f5.si/api/v1/trending?region=US',
  'https://yt.chocolatemoo53.com/api/v1/trending?region=US',
  'https://invidious.tiekoetter.com/api/v1/trending?region=US'
];

async function test() {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
      const text = await res.text();
      let data = text;
      try {
        data = JSON.parse(text);
        console.log(url, res.status, 'Valid JSON', Object.keys(data).length, 'keys');
      } catch (e) {
        console.log(url, res.status, 'Invalid JSON', text.slice(0, 50));
      }
    } catch (e) {
      console.log(url, e.message);
    }
  }
}
test();
