async function test() {
  const url = 'https://invidious.jing.rocks/api/v1/trending';
  const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }});
  const text = await res.text();
  console.log(res.status);
  console.log(text.slice(0, 100));
}
test();
