const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const path = 'luci-app-zapret2/root/usr/share/rpcd/ucode/openwrtzapret.uc';
const code = fs.readFileSync(path, 'utf8').replace(/^import \{ popen, glob, readfile \} from 'fs';\s*/m, '');
const commands = [];
let reply = '{"running":false,"daemon":false,"firewall":false,"nfqueue":false,"enabled":null,"partial":false,"error":null,"state":"STOPPED"}';
const methods = vm.runInNewContext(`(function(){${code}\n})()`, {
    popen: command => {
        commands.push(command);
        return { read: () => reply, close: () => 0 };
    },
    json: JSON.parse,
    glob: () => [],
    readfile: () => null,
    push: (list, value) => list.push(value),
    type: value => typeof value,
    match: (value, regex) => value.match(regex),
    split: (value, separator) => value.split(separator)
}).openwrtzapret;

assert.deepEqual(Object.keys(methods), ['status', 'start', 'stop', 'restart', 'set_manual', 'list_profiles', 'get_profile', 'apply_profile', 'start_test', 'start_test_all', 'flowseal_status', 'flowseal_check', 'start_flowseal_update', 'current_job', 'job_status', 'job_result', 'cancel_job']);
for (const action of ['status', 'start', 'stop', 'restart']) {
    assert.equal(methods[action].call().state, 'STOPPED');
    assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', action]);
}

reply = '{"ok":true,"profile":"manual","stage":"complete","rolled_back":false,"error":null,"state":"STOPPED"}';
assert.equal(methods.set_manual.call().ok, true);
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'set_manual']);
assert.equal(methods.apply_profile.call({ args: { id: '../bad' } }).error, 'invalid_profile_id');
reply = '{"ok":true,"profile":null}';
assert.equal(methods.apply_profile.call({ args: { id: 'builtin-default' } }).ok, true);
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'apply_profile', 'builtin-default']);
assert.equal(methods.list_profiles.call().profiles.length, 0);

reply = '{"ok":true,"job_id":"123-456","status":"PENDING"}';
assert.equal(methods.start_test.call({ args: { id: 'builtin-default' } }).ok, true);
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_start_profile', 'builtin-default']);
assert.equal(methods.start_test_all.call().job_id, '123-456');
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_start_all']);
reply = '{"ok":true,"local_version":"1.10.3"}';
assert.equal(methods.flowseal_status.call().ok, true);
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'flowseal_status']);
reply = '{"ok":true,"remote_version":"1.10.3"}';
assert.equal(methods.flowseal_check.call().ok, true);
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'flowseal_check']);
reply = '{"ok":true,"job_id":"123-456","status":"PENDING"}';
assert.equal(methods.start_flowseal_update.call().ok, true);
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_start_flowseal_update']);
assert.equal(methods.job_status.call({ args: { id: '../bad' } }).error, 'invalid_job_id');
assert.equal(methods.job_status.call({ args: { id: '123-456' } }).ok, true);
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_status', '123-456']);
assert.equal(methods.cancel_job.call({ args: { id: '123-456' } }).ok, true);
assert.deepEqual(Array.from(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_cancel', '123-456']);
reply = 'not-json';
assert.equal(methods.start.call().error, 'invalid_backend_response');
console.log('RPC dispatch checks passed');
