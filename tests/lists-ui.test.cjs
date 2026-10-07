const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const menu = JSON.parse(fs.readFileSync('luci-app-zapret2/root/usr/share/luci/menu.d/luci-app-zapret2.json', 'utf8'));
assert.equal(menu['admin/services/zapret2/settings'].title, 'Lists');
assert.equal(menu['admin/services/zapret2/settings'].action.path, 'zapret2/settings');
assert.equal(Object.keys(menu).filter(key => key.endsWith('/lists')).length, 0);

const code = fs.readFileSync('luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/settings.js', 'utf8');
const calls = [];
const listing = { ok: true, lists: [
    { name: 'list-google.txt', target: 'zapret-hosts-google.txt', source: 'builtin' },
    { name: 'list-general-user.txt', target: 'zapret-hosts-user.txt', source: 'builtin' },
    { name: 'list-exclude-user.txt', target: 'zapret-hosts-user-exclude.txt', source: 'builtin' },
    { name: 'ipset-exclude.txt', target: 'zapret-ip-exclude.txt', source: 'builtin' }
] };
function E(tag, attrs, children) {
    if (arguments.length === 2 && (Array.isArray(attrs) || typeof attrs !== 'object' || attrs?.tag)) {
        children = attrs;
        attrs = {};
    }
    return {
        tag, attrs: attrs || {}, children: Array.isArray(children) ? children : children == null ? [] : [children],
        classList: { add() {}, remove() {} },
        appendChild(child) { this.children.push(child); },
        replaceChildren(...items) { this.children = items; }
    };
}
const responses = {
    lists_status: () => listing,
    put_list: () => ({ ok: true, source: 'custom' }),
    remove_list: () => ({ ok: true, source: 'builtin' }),
    reset_lists: () => ({ ok: true })
};
const page = vm.runInNewContext(`(function(){String.prototype.format = function(...args) { let i = 0; return this.replace(/%s/g, () => String(args[i++])); }; ${code}\n})()`, {
    rpc: { declare: spec => (...args) => { calls.push([spec.method, ...args]); return Promise.resolve(responses[spec.method]()); } },
    ui: { addNotification() {} }, view: { extend: value => value },
    document: { head: { appendChild() {} } }, window: { confirm: () => true },
    L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args), resource: path => path },
    E, _: value => value, Uint8Array, Array, btoa
});

(async () => {
    page.render(await page.load());
    await page.handleFiles([{
        name: 'list-google.txt', size: 3,
        arrayBuffer: async () => Uint8Array.from([97, 98, 99]).buffer
    }]);
    assert.deepEqual(calls.at(-1), ['put_list', 'list-google.txt', 'YWJj']);
    assert.equal(page.lists[0].source, 'custom');
    await page.removeOverride('list-google.txt');
    assert.deepEqual(calls.at(-1), ['remove_list', 'list-google.txt']);
    assert.equal(page.lists[0].source, 'builtin');
    page.lists[1].source = 'custom';
    await page.resetAll();
    assert.deepEqual(calls.at(-1), ['reset_lists']);
    assert.equal(page.lists[1].source, 'builtin');
    console.log('Lists UI mapping and actions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
