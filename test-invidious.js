const urls = [
  'https://invidious.jing.rocks/api/v1/trending?region=US',
  'https://inv.tux.pizza/api/v1/trending?region=US',
  'https://yewtu.be/api/v1/trending?region=US',
  'https://vid.puffyan.us/api/v1/trending?region=US'
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
