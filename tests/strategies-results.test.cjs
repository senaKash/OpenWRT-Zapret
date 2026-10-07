const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/strategies.js', 'utf8');
assert.equal(code.includes('Check Updates'), false);

function E(tag, attrs, content) {
    if (arguments.length === 2 && (typeof attrs !== 'object' || Array.isArray(attrs) || attrs?.tag)) {
        content = attrs;
        attrs = {};
    }
    const children = Array.isArray(content) ? content : content == null ? [] : [content];
    return {
        tag, attrs: attrs || {}, children,
        appendChild(child) { this.children.push(child); },
        replaceChildren(...items) { this.children = items; }
    };
}
function find(node, tag) {
    if (!node || typeof node !== 'object') return [];
    return (node.tag === tag ? [node] : []).concat((node.children || []).flatMap(child => find(child, tag)));
}

const context = {
    rpc: { declare: () => () => Promise.resolve({}) },
    view: { extend: value => value },
    _: value => value,
    E,
    L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args) },
    ui: { addNotification: () => {} },
    poll: { add: () => {} }
};
const page = vm.runInNewContext(`(function(){${code}\n})()`, context);
page.updateProfiles = function(data) { this.profiles = data.profiles; this.renderResults(); };
page.updateFlowsealInfo = () => {};
page.updateButtons = () => {};
page.checkFlowseal = () => {};

const oldResult = {
    status: 'FAIL', tested_at: 1,
    tests: { youtube: { status: 'SKIP' }, googlevideo: { status: 'PASS' }, discord: { status: 'SKIP' }, discord_media: { status: 'PASS' }, discord_voice_udp: { status: 'PASS' } }
};
const profile = { id: 'flowseal-general-alt12', name: 'general (ALT12)', compatible: true, latest_result: oldResult };
const dom = page.render([{ ok: true, profiles: [profile] }, {}, {}]);
const table = find(dom, 'table')[0];
const headers = find(find(table, 'thead')[0], 'th');
assert.deepEqual(headers.map(header => header.children[0]),
    ['Strategy', 'Result', 'Tested', 'YouTube', 'Discord', 'Cloudflare', 'GitHub', 'Action']);
let cells = find(page.resultsBody, 'td');
assert.equal(cells.length, headers.length);
assert.equal(cells[5].children[0], 'Not tested');
assert.equal(cells[6].children[0], 'Not tested');

profile.latest_result = {
    status: 'PARTIAL', tested_at: 2, reason: 'missing requirement: /tmp/example.bin',
    tests: { youtube: { status: 'PASS' }, discord: { status: 'PASS' }, cloudflare: { status: 'FAIL' }, github: { status: 'PASS' } }
};
page.renderResults();
cells = find(page.resultsBody, 'td');
assert.equal(cells.length, headers.length);
assert.equal(cells[1].children[0].includes('/tmp/example.bin'), true);
assert.equal(cells[3].children[0], 'PASS');
assert.equal(cells[4].children[0], 'PASS');
assert.equal(cells[5].children[0], 'FAIL');
assert.equal(cells[6].children[0], 'PASS');
assert.equal(find(table, 'thead').length, 1);
console.log('Strategies result compatibility and table headers passed');
