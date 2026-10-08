const assert = require('node:assert/strict');
const fsNode = require('node:fs');
const vm = require('node:vm');

const code = fsNode.readFileSync('luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/settings.js', 'utf8');
const backend = { pending: false, runtime: 'RUNNING', restartResult: null, restartError: null, restarts: 0, statusCalls: 0 };
const data = [
    ['list-google.txt', 'zapret-hosts-google.txt'],
    ['list-general-user.txt', 'zapret-hosts-user.txt'],
    ['list-exclude-user.txt', 'zapret-hosts-user-exclude.txt'],
    ['ipset-exclude.txt', 'zapret-ip-exclude.txt']
];
const calls = [];
let modal = null;

function E(tag, attrs, children) {
    if (arguments.length === 2 && (Array.isArray(attrs) || typeof attrs !== 'object' || attrs?.tag)) {
        children = attrs;
        attrs = {};
    }
    const classes = new Set(String(attrs?.class || '').split(/\s+/).filter(Boolean));
    const node = {
        tag, attrs: attrs || {}, children: Array.isArray(children) ? children : children == null ? [] : [children],
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            contains(name) { return classes.has(name); }
        },
        appendChild(child) { this.children.push(child); },
        replaceChildren(...items) { this.children = items; },
        focus() {}
    };
    if (tag === 'textarea') node.value = typeof children === 'string' ? children : '';
    return node;
}
function makePage() {
    const context = {
        fs: { read: async () => 'example.org\n' },
        rpc: { declare: spec => async (...args) => {
            calls.push([spec.method, ...args]);
            if (spec.method === 'lists_status') return {
                ok: true, pending_changes: backend.pending,
                lists: data.map(([name, target]) => ({ name, target, source: name === 'list-exclude-user.txt' && backend.pending ? 'custom' : 'builtin' }))
            };
            if (spec.method === 'put_list') { backend.pending = true; return { ok: true, source: 'custom', pending_changes: true }; }
            if (spec.method === 'status') {
                backend.statusCalls++;
                return { ok: true, running: backend.runtime === 'RUNNING', state: backend.runtime };
            }
            if (spec.method === 'restart') {
                backend.restarts++;
                if (backend.restartError) return Promise.reject(backend.restartError);
                if (backend.restartResult) return Promise.resolve(backend.restartResult).then(result => {
                    if (result?.ok) backend.pending = false;
                    return result;
                });
                backend.pending = false;
                return { ok: true, final_state: 'RUNNING' };
            }
            return { ok: true, source: 'builtin', pending_changes: backend.pending };
        } },
        ui: { addNotification() {}, showModal: (_title, body) => { modal = body; }, hideModal: () => { modal = null; } },
        view: { extend: value => value }, document: { head: { appendChild() {} } },
        window: { confirm: () => true },
        L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args), resource: path => path },
        E, _: value => value, TextEncoder, Uint8Array, Array, btoa
    };
    return vm.runInNewContext(`(function(){String.prototype.format = function(...args) { let i = 0; return this.replace(/%s/g, () => String(args[i++])); }; ${code}\n})()`, context);
}
function find(node, tag) {
    if (!node || typeof node !== 'object') return [];
    let out = node.tag === tag ? [node] : [];
    for (const child of node.children || []) out = out.concat(find(child, tag));
    return out;
}

(async () => {
    let page = makePage();
    page.render(await page.load());
    assert.equal(page.applyButton.disabled, true);

    await page.editList(page.lists[0]);
    const textarea = modal.find(node => node?.tag === 'textarea');
    textarea.value = 'changed.example\n';
    const save = find({ children: modal }, 'button').find(button => button.children[0] === 'Save');
    await save.attrs.click();
    assert.equal(backend.pending, true);
    assert.equal(page.pendingChanges, true);
    assert.equal(page.applyStatus.textContent, 'Pending changes');
    assert.equal(page.applyButton.disabled, false);

    page = makePage();
    page.render(await page.load());
    assert.equal(page.pendingChanges, true);
    assert.equal(page.applyButton.disabled, false);

    backend.runtime = 'STOPPED';
    const beforeStoppedAttempt = backend.restarts;
    await page.applyChanges();
    assert.equal(backend.restarts, beforeStoppedAttempt);
    assert.equal(page.pendingChanges, true);
    assert.match(page.applyStatus.textContent, /zapret2 is STOPPED/);

    backend.runtime = 'RUNNING';
    const beforeRestart = backend.restarts;
    let resolveRestart;
    backend.restartResult = new Promise(resolve => { resolveRestart = resolve; });
    const applying = page.applyChanges();
    assert.equal(page.applyButton.disabled, true);
    assert.equal(page.applyButton.textContent, 'Restarting zapret2…');
    assert.equal(page.applyButton.classList.contains('spinning'), true);
    while (backend.restarts === beforeRestart) await Promise.resolve();
    resolveRestart({ ok: true, final_state: 'RUNNING' });
    await applying;
    backend.restartResult = null;
    assert.equal(backend.restarts - beforeRestart, 1);
    assert.equal(backend.pending, false);
    assert.equal(page.pendingChanges, false);
    assert.equal(page.applyButton.disabled, true);
    assert.equal(page.applyButton.classList.contains('spinning'), false);
    assert.equal(page.applyStatus.textContent, 'Changes applied successfully');

    backend.pending = true;
    backend.restartResult = { ok: false, stage: 'lock', error: 'busy', final_state: 'UNKNOWN' };
    page = makePage();
    page.render(await page.load());
    await page.applyChanges();
    assert.equal(page.pendingChanges, true);
    assert.match(page.applyStatus.textContent, /busy \(lock\)/);
    assert.equal(page.applyButton.classList.contains('spinning'), false);

    backend.restartResult = null;
    backend.restartError = new Error('RPC transport failed');
    page = makePage();
    page.render(await page.load());
    await page.applyChanges();
    assert.equal(page.pendingChanges, true);
    assert.match(page.applyStatus.textContent, /RPC transport failed/);
    assert.equal(page.applyButton.classList.contains('spinning'), false);
    console.log('Lists pending and Apply Changes behavior passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
