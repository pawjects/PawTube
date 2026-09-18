const urls = [
  'https://pipedapi.kavin.rocks/trending?region=US',
  'https://pipedapi.tokhmi.xyz/trending?region=US',
  'https://pipedapi.smnz.de/trending?region=US',
  'https://api.piped.privacydev.net/trending?region=US',
  'https://pipedapi.r4fo.com/trending?region=US'
];

async function test() {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(url, res.status, text.slice(0, 50));
    } catch (e) {
      console.log(url, e.message);
    }
  }
}
test();
