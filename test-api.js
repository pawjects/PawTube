const { PawTubeBackend } = require('./api/unified');
async function test() {
  const handler = require('./api/unified');
  const res = { status: (c) => ({ json: (data) => console.log(c, data) }), setHeader: () => {} };
  await handler({ url: '/api/unified/trending' }, res);
}
test();
