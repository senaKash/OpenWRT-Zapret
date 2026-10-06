const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const path = 'luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/dashboard.js';
const code = fs.readFileSync(path, 'utf8');
const rpcCalls = [];
const invocationCount = { start: 0 };
let resolveStart;
const context = {
    rpc: { declare: ({ method, expect }) => {
        assert.ok(Object.hasOwn(expect, ''));
        rpcCalls.push(method);
        if (method == 'start') return () => { invocationCount.start++; return new Promise(resolve => { resolveStart = resolve; }); };
        return async () => ({});
    } },
    view: { extend: x => x },
    _: x => x,
    E: () => ({}),
    L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args) },
    poll: { add: () => {} },
    ui: { addNotification: () => {} }
};
const dashboard = vm.runInNewContext(`(function(){${code}\n})()`, context);
const node = () => ({ textContent: '' });
dashboard.fields = { state: node(), daemon: node(), firewall: node(), nfqueue: node(), enabled: node(), error: node() };
dashboard.buttons = { start: {}, stop: {}, restart: {} };

dashboard.showStatus({ running: true, daemon: true, firewall: true, nfqueue: true, enabled: false, partial: false, error: null, state: 'RUNNING' });
assert.equal(dashboard.currentState, 'RUNNING');
assert.equal(dashboard.buttons.start.disabled, true);
assert.equal(dashboard.buttons.stop.disabled, false);

dashboard.showStatus({ running: false, daemon: true, firewall: false, nfqueue: false, enabled: null, partial: true, error: null, state: 'PARTIAL' });
assert.equal(dashboard.currentState, 'PARTIAL');
assert.equal(dashboard.fields.enabled.textContent, 'Unknown');
dashboard.showStatus({ running: false, daemon: false, firewall: false, nfqueue: false, enabled: true, partial: false, error: null, state: 'STOPPED' });
assert.equal(dashboard.currentState, 'STOPPED');
assert.equal(dashboard.buttons.stop.disabled, true);
dashboard.busy = true;
dashboard.updateButtons();
assert.equal(dashboard.buttons.start.disabled, true);
assert.equal(dashboard.buttons.stop.disabled, true);
assert.equal(dashboard.buttons.restart.disabled, true);

dashboard.busy = false;
dashboard.showStatus({ error: 'probe_failed' });
assert.equal(dashboard.currentState, 'ERROR');
assert.equal(dashboard.buttons.restart.disabled, true);
assert.deepEqual(rpcCalls, ['status', 'start', 'stop', 'restart']);

(async () => {
    dashboard.showStatus({ running: false, daemon: false, firewall: false, nfqueue: false, enabled: false, partial: false, error: null, state: 'STOPPED' });
    const first = dashboard.act('start');
    dashboard.act('start');
    assert.equal(invocationCount.start, 1);
    assert.equal(dashboard.busy, true);
    assert.equal(dashboard.buttons.start.textContent, 'Working…');
    resolveStart({ ok: true, status: { running: true, daemon: true, firewall: true, nfqueue: true, enabled: false, partial: false, error: null, state: 'RUNNING' } });
    await first;
    assert.equal(dashboard.busy, false);
    console.log('dashboard parsing and busy checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
