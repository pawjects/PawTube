const DEFAULT_INVIDIOUS_INSTANCES = [
  'https://invidious.jing.rocks',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.private.coffee',
  'https://invidious.fdn.fr',
  'https://yewtu.be',
  'https://vid.puffyan.us',
  'https://invidious.projectsegfau.lt',
  'https://iv.ggtyler.dev',
  'https://invidious.protokolla.fi',
  'https://invidious.lunar.icu',
  'https://invidious.privacydev.net'
];

async function test() {
  for (const url of DEFAULT_INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${url}/api/v1/trending`, { headers: { 'Accept': 'application/json' }});
      const text = await res.text();
      console.log(url, res.status, text.slice(0, 50).replace(/\n/g, '\\n'));
    } catch (e) {
      console.log(url, 'Error:', e.message);
    }
  }
}
test();
