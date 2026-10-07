const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const path = 'luci-app-zapret2/root/usr/share/rpcd/ucode/openwrtzapret.uc';
const code = fs.readFileSync(path, 'utf8').replace(/^import \{ popen, readfile \} from 'fs';\s*/m, '');
const commands = [];
let readFileValue = null;
let reply = '{"running":false,"daemon":false,"firewall":false,"nfqueue":false,"enabled":null,"partial":false,"error":null,"state":"STOPPED"}';
const methods = vm.runInNewContext(`(function(){${code}\n})()`, {
    popen: command => {
        commands.push(command);
        return { read: () => reply, close: () => 0 };
    },
    json: JSON.parse,
    glob: () => [],
    readfile: () => readFileValue,
    push: (list, value) => list.push(value),
    length: value => value.length,
    type: value => typeof value,
    match: (value, regex) => value.match(regex),
    split: (value, separator) => value.split(separator)
}).openwrtzapret;
const commandArgs = command => typeof command === 'string' ? command.split(' ') : Array.from(command);

assert.deepEqual(Object.keys(methods), ['status', 'profile_active', 'start', 'stop', 'restart', 'set_manual', 'list_profiles', 'get_profile', 'get_profile_result', 'set_profile_lock', 'delete_profile', 'import_user_strategy', 'apply_profile', 'start_test', 'start_test_all', 'flowseal_status', 'flowseal_check', 'start_flowseal_update', 'current_job', 'job_status', 'job_result', 'cancel_job']);
for (const action of ['status', 'start', 'stop', 'restart']) {
    assert.equal(methods[action].call().state, 'STOPPED');
    assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', action]);
}

reply = '{"ok":true,"profile":"manual","stage":"complete","rolled_back":false,"error":null,"state":"STOPPED"}';
assert.equal(methods.set_manual.call().ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'set_manual']);
assert.equal(methods.apply_profile.call({ args: { id: '../bad' } }).error, 'invalid_profile_id');
reply = '{"ok":true,"profile":null}';
assert.equal(methods.apply_profile.call({ args: { id: 'builtin-default' } }).ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'apply_profile', 'builtin-default']);
reply = '{"ok":true,"profiles":[{"id":"builtin-default","name":"Default","content_hash":"sha256:test","source_version":"1"}],"active_profile":"builtin-default","locked_profiles":["builtin-default"]}';
readFileValue = '{"profile_id":"builtin-default","content_hash":"sha256:test","source_version":"1","status":"PASS"}';
let beforeList = commands.length;
let listing = methods.list_profiles.call();
assert.equal(commands.length - beforeList, 1);
assert.equal(listing.profiles.length, 1);
assert.equal(listing.profiles[0].latest_result.status, 'PASS');
assert.equal(listing.active_profile, 'builtin-default');
assert.equal(listing.profiles[0].locked, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'profile_list']);

reply = '{"ok":true,"profile":{"id":"builtin-default","name":"Default","content_hash":"sha256:test","source_version":"1"}}';
const single = methods.get_profile.call({ args: { id: 'builtin-default' } });
assert.equal(single.profile.latest_result.status, 'PASS');
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'profile_get', 'builtin-default']);

let beforeResult = commands.length;
readFileValue = '{"profile_id":"builtin-default","content_hash":"sha256:test","source_version":"1","status":"PASS"}';
const directResult = methods.get_profile_result.call({ args: { id: 'builtin-default' } });
assert.equal(directResult.ok, true);
assert.equal(directResult.result.status, 'PASS');
assert.equal(commands.length, beforeResult);
assert.equal(methods.get_profile_result.call({ args: { id: '../bad' } }).error, 'invalid_profile_id');
assert.equal(commands.length, beforeResult);

reply = '{"ok":true,"profile":"builtin-default","locked":true}';
assert.equal(methods.set_profile_lock.args.id, 'string');
assert.equal(methods.set_profile_lock.args.locked, true);
const beforeLock = commands.length;
assert.equal(methods.set_profile_lock.call({ args: { id: 'builtin-default', locked: true } }).locked, true);
assert.equal(commands.length, beforeLock + 1);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'profile_lock', 'builtin-default']);
reply = '{"ok":true,"profile":"builtin-default","locked":false}';
assert.equal(methods.set_profile_lock.call({ args: { id: 'builtin-default', locked: false } }).locked, false);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'profile_unlock', 'builtin-default']);
reply = '{"ok":true,"profile":"builtin-default"}';
assert.equal(methods.delete_profile.call({ args: { id: 'builtin-default' } }).ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'profile_delete', 'builtin-default']);
reply = '{"ok":true,"profile":"user-1"}';
assert.equal(methods.import_user_strategy.call({ args: { data: 'QUJD' } }).ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'profile_import_user', 'QUJD']);

reply = '{"ok":true,"job_id":"123-456","status":"PENDING"}';
assert.equal(methods.start_test.call({ args: { id: 'builtin-default' } }).ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_start_profile', 'builtin-default']);
assert.equal(methods.start_test_all.call().job_id, '123-456');
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_start_all']);
reply = '{"ok":true,"local_version":"1.10.3"}';
assert.equal(methods.flowseal_status.call().ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'flowseal_status']);
reply = '{"ok":true,"remote_version":"1.10.3"}';
assert.equal(methods.flowseal_check.call().ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'flowseal_check']);
reply = '{"ok":true,"job_id":"123-456","status":"PENDING"}';
assert.equal(methods.start_flowseal_update.call().ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_start_flowseal_update']);
assert.equal(methods.job_status.call({ args: { id: '../bad' } }).error, 'invalid_job_id');
assert.equal(methods.job_status.call({ args: { id: '123-456' } }).ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_status', '123-456']);
assert.equal(methods.cancel_job.call({ args: { id: '123-456' } }).ok, true);
assert.deepEqual(commandArgs(commands.at(-1)), ['/usr/libexec/openwrtzapret/service', 'job_cancel', '123-456']);
reply = 'not-json';
assert.equal(methods.start.call().error, 'invalid_backend_response');
console.log('RPC dispatch checks passed');
