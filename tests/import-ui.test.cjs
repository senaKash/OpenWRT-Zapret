const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/import.js', 'utf8');
const calls = [], notifications = [];
function E(tag, attrs, content) {
    if (arguments.length === 2 && (typeof attrs !== 'object' || Array.isArray(attrs) || attrs?.tag)) {
        content = attrs;
        attrs = {};
    }
    return { tag, attrs: attrs || {}, children: Array.isArray(content) ? content : content == null ? [] : [content] };
}
const context = {
    rpc: { declare: spec => data => { calls.push([spec.method, data]); return Promise.resolve({ ok: true, profile: 'user-1' }); } },
    view: { extend: value => value },
    ui: { addNotification: (_title, node) => notifications.push(node) },
    _: value => value,
    E,
    L: { bind: (fn, receiver) => fn.bind(receiver), url: path => path, resource: path => path },
    window: { location: { href: '' } },
    TextEncoder,
    btoa
};
const page = vm.runInNewContext(`(function(){String.prototype.format = function(...args) { let i = 0; return this.replace(/%s/g, () => String(args[i++])); }; ${code}\n})()`, context);

(async () => {
    page.render();
    assert.equal(page.fileInput.attrs.type, 'file');
    page.fileInput.files = [{ size: 100, text: async () => '@echo off\r\nstart winws.exe' }];
    await page.loadBatFile();
    assert.equal(page.input.value, '@echo off\r\nstart winws.exe');
    await page.addStrategy();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'import_user_strategy');
    assert.equal(Buffer.from(calls[0][1], 'base64').toString('utf8'), page.input.value);
    assert.equal(context.window.location.href, 'admin/services/zapret2/strategies');

    page.fileInput.files = [{ size: 32769, text: async () => 'too large' }];
    await page.loadBatFile();
    assert.equal(page.input.value, '');
    assert.equal(notifications.length, 2);
    console.log('Import Strategy file selection and RPC path passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
