// Manual CJS mock for the ESM-only uuid package.
// Jest cannot parse uuid's ESM exports, so we map it here.
const crypto = require('crypto');
module.exports = {
    v4: () => crypto.randomUUID(),
    v1: () => crypto.randomUUID(),
    validate: (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str),
    NIL: '00000000-0000-0000-0000-000000000000',
};
