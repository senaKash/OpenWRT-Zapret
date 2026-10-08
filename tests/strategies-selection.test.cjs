const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('luci-app-zapret2/htdocs/luci-static/resources/view/zapret2/strategies.js', 'utf8');
const acl = JSON.parse(fs.readFileSync('luci-app-zapret2/root/usr/share/rpcd/acl.d/luci-app-zapret2.json', 'utf8'))['luci-app-zapret2'];
for (const method of ['list_profiles', 'get_profile_result', 'profile_active', 'current_job', 'job_status', 'job_result', 'flowseal_status', 'flowseal_check'])
    assert.ok(acl.read.ubus.openwrtzapret.includes(method), method);
for (const method of ['apply_profile', 'set_manual', 'start_test', 'start_test_all', 'cancel_job', 'start_flowseal_update', 'set_profile_lock', 'delete_profile', 'import_user_strategy'])
    assert.ok(acl.write.ubus.openwrtzapret.includes(method), method);
const calls = [];
const declarations = {};
const notifications = [];
let lockFailure = false;
const profiles = [
    { id: 'builtin-default', name: 'Zapret2 default', compatible: true },
    { id: 'flowseal-general-alt', name: 'general (ALT)', compatible: true, content_hash: 'sha256:alt', source_version: '1' },
    { id: 'flowseal-broken', name: 'broken', compatible: false }
];
const listing = { ok: true, active_profile: null, profiles };
let jobReply = { ok: true, job_id: '1-2', mode: 'all', status: 'RUNNING', stage: 'testing', profile_id: 'flowseal-next', current: 2, total: 3 };
const replies = {
    list_profiles: () => listing,
    status: () => ({ ok: true, running: true, daemon: true, firewall: true, nfqueue: true, partial: false }),
    current_job: () => ({ ok: true, job_id: null }),
    job_status: () => jobReply,
    job_result: () => ({ ok: true, status: 'DONE', results: [
        { profile_id: 'flowseal-one' }, { profile_id: 'flowseal-two' }, { profile_id: 'flowseal-next' }
    ] }),
    get_profile_result: id => ({ ok: true, result: { profile_id: id, content_hash: 'sha256:alt', source_version: '1', status: 'PASS', tested_at: 1 } }),
    set_profile_lock: (id, locked) => lockFailure ? { ok: false, error: 'busy' } : { ok: true, profile: id, locked },
    delete_profile: id => ({ ok: true, profile: id }),
    profile_active: () => ({ ok: true, profile: 'builtin-default' }),
    start_test: id => ({ ok: true, job_id: '1-2', total: 1, status: 'PENDING' }),
    apply_profile: id => ({ ok: true })
};
const context = {
    rpc: { declare: spec => {
        declarations[spec.method] = spec;
        return (...args) => {
            const { method } = spec;
            calls.push([method, ...args]);
            return Promise.resolve(replies[method]?.(...args) || { ok: true });
        };
    } },
    view: { extend: value => value },
    _: value => value,
    E: (tag, attrs, text) => ({ tag, attrs, text }),
    L: { bind: (fn, receiver, ...args) => fn.bind(receiver, ...args), resource: path => path, url: path => path },
    document: { head: { appendChild() {} } },
    ui: { addNotification: (_title, node) => notifications.push(node) },
    poll: { add: () => {} }
};
const page = vm.runInNewContext(`(function(){String.prototype.format = function(...args) { let i = 0; return this.replace(/%[ds]/g, () => String(args[i++])); }; ${code}\n})()`, context);
assert.deepEqual(Array.from(declarations.set_profile_lock.params), ['id', 'locked']);
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
    const initial = await page.load();
    assert.equal(initial.length, 2);
    assert.equal(calls.filter(call => call[0] === 'list_profiles').length, 0);
    await page.loadProfiles();
    assert.equal(calls.filter(call => call[0] === 'list_profiles').length, 1);
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
    assert.equal(page.active.textContent, 'Manual mode');
    await page.refreshJob();
    assert.equal(page.active.textContent, 'Zapret2 default');
    assert.equal(page.selector.value, 'flowseal-general-alt');

    // Повторный idle tick через 2 секунды не должен снова будить backend.
    const idleStatusCalls = calls.filter(call => call[0] === 'status').length;
    const idleCurrentCalls = calls.filter(call => call[0] === 'current_job').length;
    const idleActiveCalls = calls.filter(call => call[0] === 'profile_active').length;
    await page.refreshJob();
    assert.equal(calls.filter(call => call[0] === 'status').length, idleStatusCalls);
    assert.equal(calls.filter(call => call[0] === 'current_job').length, idleCurrentCalls);
    assert.equal(calls.filter(call => call[0] === 'profile_active').length, idleActiveCalls);

    page.activeJob = '1-2';
    page.jobState = { status: 'RUNNING', stage: 'testing', mode: 'all', profile_id: 'flowseal-general-alt' };
    page.showJob = state => { page.jobState = state; };
    const listCalls = calls.filter(call => call[0] === 'list_profiles').length;
    const activeStatusCalls = calls.filter(call => call[0] === 'status').length;
    const activeCurrentCalls = calls.filter(call => call[0] === 'current_job').length;
    const activeProfileCalls = calls.filter(call => call[0] === 'profile_active').length;
    await page.refreshJob();
    assert.equal(calls.filter(call => call[0] === 'list_profiles').length, listCalls);
    assert.equal(calls.filter(call => call[0] === 'status').length, activeStatusCalls);
    assert.equal(calls.filter(call => call[0] === 'current_job').length, activeCurrentCalls);
    assert.equal(calls.filter(call => call[0] === 'profile_active').length, activeProfileCalls);
    assert.deepEqual(calls.find(call => call[0] === 'get_profile_result'), ['get_profile_result', 'flowseal-general-alt']);

    // Результат текущей строки читается и при переходе testing -> result с тем же profile_id.
    const resultCalls = calls.filter(call => call[0] === 'get_profile_result').length;
    jobReply = { ok: true, job_id: '1-2', mode: 'all', status: 'RUNNING', stage: 'result', profile_id: 'flowseal-next', current: 2, total: 3 };
    await page.refreshJob();
    assert.equal(calls.filter(call => call[0] === 'get_profile_result').length, resultCalls + 1);
    assert.deepEqual(calls.filter(call => call[0] === 'get_profile_result').at(-1), ['get_profile_result', 'flowseal-next']);

    // На terminal transition runtime/profile перечитываются ровно один раз, current_job не нужен.
    jobReply = { ok: true, job_id: '1-2', mode: 'all', status: 'DONE', stage: 'complete', profile_id: 'flowseal-next', current: 3, total: 3 };
    const terminalStatusCalls = calls.filter(call => call[0] === 'status').length;
    const terminalCurrentCalls = calls.filter(call => call[0] === 'current_job').length;
    const terminalActiveCalls = calls.filter(call => call[0] === 'profile_active').length;
    let reportRequested, releaseReport;
    const reportStarted = new Promise(resolve => { reportRequested = resolve; });
    replies.job_result = () => {
        reportRequested();
        return new Promise(resolve => { releaseReport = () => resolve({ ok: true, status: 'DONE', results: [
            { profile_id: 'flowseal-one' }, { profile_id: 'flowseal-two' }, { profile_id: 'flowseal-next' }
        ] }); });
    };
    const terminalRefresh = page.refreshJob();
    await reportStarted;
    assert.equal(page.jobState.status, 'RUNNING');
    assert.equal(page.activeJob, '1-2');
    releaseReport();
    await terminalRefresh;
    assert.equal(calls.filter(call => call[0] === 'status').length, terminalStatusCalls + 1);
    assert.equal(calls.filter(call => call[0] === 'current_job').length, terminalCurrentCalls);
    assert.equal(calls.filter(call => call[0] === 'profile_active').length, terminalActiveCalls + 1);
    assert.equal(page.activeJob, null);

    page.jobState = null;
    page.testing = false;

    await page.startTesting(false);
    assert.deepEqual(calls.find(call => call[0] === 'start_test'), ['start_test', 'flowseal-general-alt']);
    assert.equal(page.activeJob, '1-2');
    page.testing = false;
    page.activeJob = null;
    await page.applySelected(null);
    assert.deepEqual(calls.find(call => call[0] === 'apply_profile'), ['apply_profile', 'flowseal-general-alt']);
    assert.equal(page.selector.value, 'flowseal-general-alt');

    const profile = page.profiles.find(item => item.id === 'flowseal-general-alt');
    profile.locked = false;
    const lock = { textContent: '🔓', title: 'Strategy unlocked', setAttribute(name, value) { this[name] = value; } };
    const remove = { profileId: profile.id, profileLocked: false, disabled: false };
    page.resultRows = { [profile.id]: { lock, remove } };
    page.rowLockButtons = [lock];
    page.rowDeleteButtons = [remove];
    const beforeLockList = calls.filter(call => call[0] === 'list_profiles').length;
    const beforeLockCalls = calls.filter(call => call[0] === 'set_profile_lock').length;
    await page.toggleProfileLock(profile.id);
    assert.equal(calls.filter(call => call[0] === 'set_profile_lock').length, beforeLockCalls + 1);
    assert.deepEqual(calls.at(-1), ['set_profile_lock', profile.id, true]);
    assert.equal(calls.filter(call => call[0] === 'list_profiles').length, beforeLockList);
    assert.equal(profile.locked, true);
    assert.equal(lock.textContent, '🔒');
    assert.equal(lock.title, 'Strategy locked');
    assert.equal(remove.disabled, true);

    const beforeDelete = calls.filter(call => call[0] === 'delete_profile').length;
    await page.removeProfile(profile.id);
    assert.equal(calls.filter(call => call[0] === 'delete_profile').length, beforeDelete);

    lockFailure = true;
    const beforeNotifications = notifications.length;
    await page.toggleProfileLock(profile.id);
    assert.equal(notifications.length, beforeNotifications + 1);
    assert.equal(profile.locked, true);
    assert.equal(lock.textContent, '🔒');
    assert.equal(calls.filter(call => call[0] === 'list_profiles').length, beforeLockList);

    lockFailure = false;
    await page.toggleProfileLock(profile.id);
    assert.equal(profile.locked, false);
    assert.equal(lock.textContent, '🔓');
    assert.equal(lock.title, 'Strategy unlocked');
    assert.equal(remove.disabled, false);
    await page.removeProfile(profile.id);
    assert.equal(calls.filter(call => call[0] === 'delete_profile').length, beforeDelete + 1);
    assert.equal(calls.filter(call => call[0] === 'list_profiles').length, beforeLockList);
    assert.equal(page.profiles.some(item => item.id === profile.id), false);
    console.log('Strategies selection and RPC checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
