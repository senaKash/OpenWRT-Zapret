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
    L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args), resource: path => path },
    document: { head: { appendChild() {} } },
    ui: { addNotification: () => {} },
    poll: { add: () => {} }
};
const page = vm.runInNewContext(`(function(){String.prototype.format = function(...args) { let i = 0; return this.replace(/%[ds]/g, () => String(args[i++])); }; ${code}\n})()`, context);
page.updateProfiles = function(data) { this.profiles = data.profiles; this.renderResults(); };
page.updateFlowsealInfo = () => {};
page.updateButtons = () => {};
page.checkFlowseal = () => {};

const oldResult = {
    status: 'FAIL', tested_at: 1,
    tests: { youtube: { status: 'SKIP' }, googlevideo: { status: 'PASS' }, discord: { status: 'SKIP' }, discord_media: { status: 'PASS' }, discord_voice_udp: { status: 'PASS' } }
};
const profile = { id: 'flowseal-general-alt12', name: 'general (ALT12)', compatible: true, content_hash: 'sha256:alt12', source_version: '1.10.3', latest_result: oldResult };
const dom = page.render([{ ok: true, profiles: [profile] }, {}, {
    running: true, daemon: true, firewall: true, nfqueue: true, partial: false
}]);
const table = find(dom, 'table')[0];
const headers = find(find(table, 'thead')[0], 'th');
assert.deepEqual(headers.map(header => header.children[0]),
    ['Strategy', 'Result', 'YouTube', 'Discord', 'Cloudflare', 'GitHub', 'Tested', 'Action']);
let cells = find(page.resultsBody, 'td');
assert.equal(cells.length, headers.length);
assert.equal(cells[4].children[0], '—');
assert.equal(cells[5].children[0], '—');
assert.equal(page.stateBadge.textContent, 'RUNNING');

profile.latest_result = {
    status: 'PARTIAL', tested_at: 2, reason: 'missing requirement: /tmp/example.bin',
    tests: { youtube: { status: 'PASS' }, discord: { status: 'PASS' }, cloudflare: { status: 'FAIL' }, github: { status: 'PASS' } }
};
page.renderResults();
cells = find(page.resultsBody, 'td');
assert.equal(cells.length, headers.length);
assert.equal(cells[1].children[0].children[0], 'PARTIAL');
assert.equal(cells[1].children[1].children[0], 'missing requirement: /tmp/example.bin');
assert.equal(cells[2].children[0].children[0], 'PASS');
assert.equal(cells[3].children[0].children[0], 'PASS');
assert.equal(cells[4].children[0].children[0], 'FAIL');
assert.equal(cells[5].children[0].children[0], 'PASS');
assert.equal(find(table, 'thead').length, 1);
const row = page.resultRows[profile.id].row;
page.showJob({ job_id: '1-2', status: 'RUNNING', stage: 'testing', profile_id: profile.id, current: 17, total: 21 });
cells = find(page.resultsBody, 'td');
assert.equal(page.jobProgress.value, 81);
assert.equal(page.jobPercent.textContent, '81%');
assert.equal(page.jobProgressRow.hidden, false);
assert.equal(page.jobText.textContent.includes('17 / 21'), true);
assert.equal(page.jobText.textContent.includes('general (ALT12)'), true);
assert.equal(page.stateBadge.textContent, 'TESTING');
assert.equal(page.resultRows[profile.id].row, row);
assert.equal(row.className, 'owz-current-row');
assert.equal(cells[1].children[0].children[0], 'TESTING');
const next = { id: 'flowseal-general-alt13', name: 'general (ALT13)', compatible: true, content_hash: 'sha256:alt13', source_version: '1.10.3' };
page.profiles.push(next);
page.renderResults();
const firstRow = page.resultRows[profile.id].row;
const nextRow = page.resultRows[next.id].row;
page.showJob({ job_id: '1-2', status: 'RUNNING', stage: 'testing', profile_id: next.id, current: 18, total: 21 });
assert.equal(page.resultRows[profile.id].row, firstRow);
assert.equal(page.resultRows[next.id].row, nextRow);
assert.equal(firstRow.className, '');
assert.equal(nextRow.className, 'owz-current-row');
assert.equal(page.resultRows[next.id].result.children[0].children[0], 'TESTING');
assert.equal(page.jobPercent.textContent, '86%');
assert.equal(find(page.resultsBody, 'td').length, headers.length * 2);
page.updateProfileResult(profile.id, {
    profile_id: profile.id,
    content_hash: profile.content_hash,
    source_version: profile.source_version,
    status: 'PASS', tested_at: 3,
    tests: { youtube: { status: 'PASS' } }
});
assert.equal(page.resultRows[profile.id].row, firstRow);
assert.equal(page.resultRows[profile.id].result.children[0].children[0], 'PASS');
assert.equal(page.resultRows[next.id].result.children[0].children[0], 'TESTING');
console.log('Strategies result compatibility and table headers passed');
