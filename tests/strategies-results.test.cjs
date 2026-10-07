const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/strategies.js', 'utf8');
assert.equal(code.includes('Check Updates'), false);
let stylesheet;

function E(tag, attrs, content) {
    if (arguments.length === 2 && (typeof attrs !== 'object' || Array.isArray(attrs) || attrs?.tag)) {
        content = attrs;
        attrs = {};
    }
    const children = Array.isArray(content) ? content : content == null ? [] : [content];
    return {
        tag, attrs: attrs || {}, children,
        appendChild(child) { this.children.push(child); },
        replaceChildren(...items) { this.children = items; },
        setAttribute(name, value) { this.attrs[name] = value; }
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
    L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args), resource: path => path, url: path => path },
    document: { head: { appendChild(node) { stylesheet = node; } } },
    ui: { addNotification: () => {} },
    poll: { add: () => {} }
};
const page = vm.runInNewContext(`(function(){String.prototype.format = function(...args) { let i = 0; return this.replace(/%[ds]/g, () => String(args[i++])); }; ${code}\n})()`, context);
assert.equal(stylesheet.attrs.href, 'view/zapret2/strategies.css?v=23');
page.updateProfiles = function(data) { this.profiles = data.profiles; this.updateActiveProfile(data.active_profile); this.renderResults(); };
page.updateFlowsealInfo = () => {};
page.updateButtons = () => {};
page.checkFlowseal = () => {};

const oldResult = {
    status: 'FAIL', tested_at: 1,
    tests: { youtube: { status: 'SKIP' }, googlevideo: { status: 'PASS' }, discord: { status: 'SKIP' }, discord_media: { status: 'PASS' }, discord_voice_udp: { status: 'PASS' } }
};
const profile = { id: 'flowseal-general-alt12', name: 'general (ALT12)', compatible: true, content_hash: 'sha256:alt12', source_version: '1.10.3', latest_result: oldResult };
page.loadProfiles = () => {
    page.updateProfiles({ ok: true, profiles: [profile], active_profile: profile.id });
    return Promise.resolve();
};
const dom = page.render([{}, {
    running: true, daemon: true, firewall: true, nfqueue: true, partial: false
}]);
const table = find(dom, 'table')[0];
const topLayout = find(dom, 'div').find(node => node.attrs.class === 'owz-top-layout');
assert.equal(dom.children[0], topLayout);
assert.equal(topLayout.children[0].attrs.class, 'owz-top-column');
assert.equal(topLayout.children[1].attrs.class, 'owz-top-column');
assert.equal(topLayout.children[0].children[0].attrs.class, 'cbi-section owz-control-section');
assert.equal(topLayout.children[1].children[0].attrs.class, 'cbi-section owz-updates-section');
assert.equal(find(topLayout.children[1], 'a')[0].children[0], 'Import your strategy');
assert.equal(find(topLayout.children[1], 'a')[0].attrs.class.includes('cbi-button-apply'), true);
assert.equal(find(topLayout.children[0], 'span').some(node => node.children[0] === '$'), true);
assert.equal(find(dom.children[1], 'table')[0], table);
assert.equal(find(dom.children[1], 'h2')[0].children[0], 'Tests');
assert.equal(find(dom.children[1], 'button')[0].children[0], 'Test All');
const headers = find(find(table, 'thead')[0], 'th');
assert.deepEqual(headers.map(header => header.children[0]),
    ['#', 'Lock', 'Strategy', 'Result', 'YouTube', 'Discord', 'Cloudflare', 'GitHub', 'Tested', 'Action']);

assert.equal(table.attrs.class.includes('owz-results-table'), true);
const colgroup = find(table, 'colgroup')[0];
const cols = find(colgroup, 'col');
assert.equal(cols.length, 10);
assert.deepEqual(cols.map(col => col.attrs.class), [
    'owz-col-index', 'owz-col-lock', 'owz-col-strategy', 'owz-col-result',
    'owz-col-probe', 'owz-col-probe', 'owz-col-probe', 'owz-col-probe',
    'owz-col-tested', 'owz-col-action'
]);
assert.equal(headers[2].attrs.class, 'owz-sortable');
assert.equal(headers[3].attrs.class, 'owz-sortable');
assert.equal(headers[8].attrs.class, 'owz-sortable');
let cells = find(page.resultsBody, 'td');
assert.equal(cells.length, headers.length);
assert.equal(cells[0].attrs.class, 'owz-index-cell');
assert.equal(cells[1].attrs.class, 'owz-lock-cell');
assert.equal(cells[2].attrs.class, 'owz-strategy-cell');
assert.equal(cells[3].attrs.class, 'owz-result-cell');
assert.equal(cells[4].attrs.class, 'owz-probe-cell');
assert.equal(cells[8].attrs.class, 'owz-tested-cell');
assert.equal(cells[9].attrs.class, 'owz-action-cell');
assert.equal(cells[6].children[0], '—');
assert.equal(cells[7].children[0], '—');
assert.equal(cells[1].children[0].children[0], '🔓');
assert.equal(cells[9].children[0].children[0], '🗑');
assert.equal(find(page.resultsBody, 'button').length, 2);
assert.equal(page.resultRows[profile.id].row.className, 'owz-active-strategy');
assert.equal(page.stateBadge.textContent, 'RUNNING');
assert.equal(page.active.className, 'owz-badge owz-badge-pass');

profile.latest_result = {
    status: 'PARTIAL', tested_at: 2, reason: 'missing requirement: /tmp/example.bin',
    tests: { youtube: { status: 'PASS' }, discord: { status: 'PASS' }, cloudflare: { status: 'FAIL' }, github: { status: 'PASS' } }
};
page.renderResults();
cells = find(page.resultsBody, 'td');
assert.equal(cells.length, headers.length);
assert.equal(cells[3].children[0].children[0], 'PARTIAL');
assert.equal(cells[3].children[1].children[0], 'missing requirement: /tmp/example.bin');
assert.equal(cells[4].children[0].children[0], 'PASS');
assert.equal(cells[5].children[0].children[0], 'PASS');
assert.equal(cells[6].children[0].children[0], 'FAIL');
assert.equal(cells[7].children[0].children[0], 'PASS');
assert.equal(find(table, 'thead').length, 1);
const row = page.resultRows[profile.id].row;
page.showJob({ job_id: '1-2', status: 'RUNNING', stage: 'testing', profile_id: profile.id, current: 17, total: 21 });
cells = find(page.resultsBody, 'td');
assert.equal(page.jobProgress.textContent, '[###################.....]');
assert.equal(page.jobProgress.attrs['aria-valuenow'], 81);
assert.equal(page.jobPercent.textContent, '81%');
assert.equal(page.jobProgressRow.hidden, false);
assert.equal(page.jobText.textContent.includes('17 / 21'), true);
assert.equal(page.jobText.textContent.includes('general (ALT12)'), true);
assert.equal(page.stateBadge.textContent, 'TESTING');
assert.equal(page.active.className, 'owz-badge owz-badge-neutral');
assert.equal(page.resultRows[profile.id].row, row);
assert.equal(row.className.includes('owz-current-row'), true);
assert.equal(row.className.includes('owz-active-strategy'), true);
assert.equal(cells[3].children[0].children[0], 'TESTING');
const next = { id: 'flowseal-general-alt13', name: 'general (ALT13)', compatible: true, content_hash: 'sha256:alt13', source_version: '1.10.3' };
page.profiles.push(next);
page.renderResults();
const firstRow = page.resultRows[profile.id].row;
const nextRow = page.resultRows[next.id].row;
page.showJob({ job_id: '1-2', status: 'RUNNING', stage: 'testing', profile_id: next.id, current: 18, total: 21 });
assert.equal(page.resultRows[profile.id].row, firstRow);
assert.equal(page.resultRows[next.id].row, nextRow);
assert.equal(firstRow.className, 'owz-active-strategy');
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
page.showJob(null);
assert.equal(page.active.className, 'owz-badge owz-badge-pass');
page.updateActiveProfile(next.id);
assert.equal(page.resultRows[profile.id].row.className, '');
assert.equal(page.resultRows[next.id].row.className, 'owz-active-strategy');
page.setSort('name');
assert.equal(page.resultsBody.children[0].children[0].children[0], '1');
assert.equal(page.resultsBody.children[0].children[2].children[0], 'general (ALT13)');
assert.equal(page.resultsBody.children[1].children[0].children[0], '2');
console.log('Strategies result compatibility and table headers passed');
