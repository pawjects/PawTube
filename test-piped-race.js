async function test() {
  const res = await fetch('https://raw.githubusercontent.com/TeamPiped/Piped/master/instances.json');
  console.log(res.status);
}
test();
