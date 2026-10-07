const assert = require('node:assert/strict');
const fsNode = require('node:fs');
const vm = require('node:vm');

const menu = JSON.parse(fsNode.readFileSync('luci-app-zapret2/root/usr/share/luci/menu.d/luci-app-zapret2.json', 'utf8'));
assert.equal(menu['admin/services/zapret2/settings'].title, 'Lists');
assert.equal(menu['admin/services/zapret2/settings'].action.path, 'zapret2/settings');
assert.equal(Object.keys(menu).filter(key => key.endsWith('/lists')).length, 0);

const code = fsNode.readFileSync('luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/settings.js', 'utf8');
assert.equal(code.includes('Zapret2 file'), false);
assert.equal(code.includes('handleFiles'), false);
assert.equal(code.includes("fs.read('/opt/zapret2/ipset/' + item.target)"), true);

const calls = [], reads = [], notifications = [];
let modal = null;
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
    const node = {
        tag, attrs: attrs || {}, children: Array.isArray(children) ? children : children == null ? [] : [children],
        classList: { add() {}, remove() {} },
        appendChild(child) { this.children.push(child); },
        replaceChildren(...items) { this.children = items; },
        focus() {}
    };
    if (tag === 'textarea') node.value = typeof children === 'string' ? children : '';
    return node;
}
function find(node, tag) {
    if (!node || typeof node !== 'object') return [];
    let out = node.tag === tag ? [node] : [];
    for (const child of node.children || []) out = out.concat(find(child, tag));
    return out;
}
const responses = {
    lists_status: () => listing,
    put_list: () => ({ ok: true, source: 'custom' }),
    remove_list: () => ({ ok: true, source: 'builtin' }),
    reset_lists: () => ({ ok: true })
};
const page = vm.runInNewContext(`(function(){String.prototype.format = function(...args) { let i = 0; return this.replace(/%s/g, () => String(args[i++])); }; ${code}\n})()`, {
    fs: { read: path => { reads.push(path); return Promise.resolve('guap.ru\n'); } },
    rpc: { declare: spec => (...args) => { calls.push([spec.method, ...args]); return Promise.resolve(responses[spec.method]()); } },
    ui: {
        addNotification: (_title, node) => notifications.push(node),
        showModal: (title, body) => { modal = { title, body }; },
        hideModal: () => { modal = null; }
    },
    view: { extend: value => value },
    document: { head: { appendChild() {} } }, window: { confirm: () => true },
    L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args), resource: path => path },
    E, _: value => value, TextEncoder, Uint8Array, Array, btoa
});

(async () => {
    const rendered = page.render(await page.load());
    const headers = find(rendered, 'th').map(node => node.children[0]);
    assert.deepEqual(headers, ['List', 'Source', 'Action']);

    await page.editList(page.lists[2]);
    assert.deepEqual(reads, ['/opt/zapret2/ipset/zapret-hosts-user-exclude.txt']);
    assert.equal(modal.title, 'Edit list-exclude-user.txt');
    const textarea = modal.body.find(node => node?.tag === 'textarea');
    assert.equal(textarea.value, 'guap.ru\n');
    textarea.value = 'guap.ru\npro.guap.ru\n';
    const save = find({ children: modal.body }, 'button').find(node => node.children[0] === 'Save');
    await save.attrs.click();
    assert.deepEqual(calls.at(-1), ['put_list', 'list-exclude-user.txt', Buffer.from(textarea.value, 'utf8').toString('base64')]);
    assert.equal(page.lists[2].source, 'custom');

    await page.removeOverride('list-exclude-user.txt');
    assert.deepEqual(calls.at(-1), ['remove_list', 'list-exclude-user.txt']);
    assert.equal(page.lists[2].source, 'builtin');

    page.lists[1].source = 'custom';
    await page.resetAll();
    assert.deepEqual(calls.at(-1), ['reset_lists']);
    assert.equal(page.lists[1].source, 'builtin');
    console.log('Lists editor and override actions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
