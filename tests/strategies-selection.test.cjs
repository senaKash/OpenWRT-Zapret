const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/strategies.js', 'utf8');
const acl = JSON.parse(fs.readFileSync('luci-app-zapret2/root/usr/share/rpcd/acl.d/luci-app-zapret2.json', 'utf8'))['luci-app-zapret2'];
for (const method of ['list_profiles', 'profile_active', 'current_job', 'job_status', 'job_result', 'flowseal_status', 'flowseal_check'])
    assert.ok(acl.read.ubus.openwrtzapret.includes(method), method);
for (const method of ['apply_profile', 'set_manual', 'start_test', 'start_test_all', 'cancel_job', 'start_flowseal_update'])
    assert.ok(acl.write.ubus.openwrtzapret.includes(method), method);
const calls = [];
const profiles = [
    { id: 'builtin-default', name: 'Zapret2 default', compatible: true },
    { id: 'flowseal-general-alt', name: 'general (ALT)', compatible: true },
    { id: 'flowseal-broken', name: 'broken', compatible: false }
];
const listing = { ok: true, active_profile: null, profiles };
const replies = {
    list_profiles: () => listing,
    current_job: () => ({ ok: true, job_id: null }),
    profile_active: () => ({ ok: true, profile: 'builtin-default' }),
    start_test: id => ({ ok: true, job_id: '1-2', total: 1, status: 'PENDING' }),
    apply_profile: id => ({ ok: true })
};
const context = {
    rpc: { declare: ({ method }) => (...args) => {
        calls.push([method, ...args]);
        return Promise.resolve(replies[method]?.(...args) || { ok: true });
    } },
    view: { extend: value => value },
    _: value => value,
    E: (tag, attrs, text) => ({ tag, attrs, text }),
    L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args) },
    ui: { addNotification: () => {} },
    poll: { add: () => {} }
};
const page = vm.runInNewContext(`(function(){${code}\n})()`, context);
page.selector = {
    options: [],
    _value: '',
    replaceChildren() { this.options = []; this._value = ''; },
    appendChild(option) { this.options.push(option); },
    get value() { return this._value; },
    set value(id) { this._value = this.options.some(option => option.attrs.value === id && !option.attrs.disabled) ? id : ''; },
    get selectedIndex() { return this.options.findIndex(option => option.attrs.value === this._value); }
};
page.active = { textContent: '' };
page.applyButton = { disabled: false };
page.testButton = { disabled: false };
page.testAllButton = { disabled: false };
page.renderResults = () => {};
page.showJob = () => {};

(async () => {
    page.updateProfiles(listing);
    assert.equal(page.selector.value, '__manual__');
    const compatible = page.selector.options.find(option => option.attrs.value === 'flowseal-general-alt');
    const incompatible = page.selector.options.find(option => option.attrs.value === 'flowseal-broken');
    assert.equal(Object.hasOwn(compatible.attrs, 'disabled'), false);
    assert.equal(incompatible.attrs.disabled, true);

    page.selector.value = 'flowseal-general-alt';
    page.selectProfile();
    assert.equal(page.selectedProfileId, 'flowseal-general-alt');
    assert.equal(page.testButton.disabled, false);
    assert.equal(page.applyButton.disabled, false);
    page.updateProfiles(listing);
    assert.equal(page.selector.value, 'flowseal-general-alt');
    assert.equal(page.active.textContent, 'Manual / Settings');
    await page.refreshJob();
    assert.equal(page.active.textContent, 'Zapret2 default');
    assert.equal(page.selector.value, 'flowseal-general-alt');

    await page.startTesting(false);
    assert.deepEqual(calls.find(call => call[0] === 'start_test'), ['start_test', 'flowseal-general-alt']);
    assert.equal(page.activeJob, '1-2');
    page.testing = false;
    page.activeJob = null;
    await page.applySelected(null);
    assert.deepEqual(calls.find(call => call[0] === 'apply_profile'), ['apply_profile', 'flowseal-general-alt']);
    assert.equal(page.selector.value, 'flowseal-general-alt');
    console.log('Strategies selection and RPC checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
