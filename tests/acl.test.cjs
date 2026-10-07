const assert = require('node:assert/strict');
const fs = require('node:fs');

const acl = JSON.parse(fs.readFileSync('luci-app-zapret2/root/usr/share/rpcd/acl.d/luci-app-zapret2.json', 'utf8'))['luci-app-zapret2'];
assert.deepEqual(acl.read.ubus.openwrtzapret, ['status', 'profile_active', 'list_profiles', 'get_profile', 'get_profile_result', 'current_job', 'job_status', 'job_result', 'flowseal_status', 'flowseal_check']);
assert.deepEqual(acl.write.ubus.openwrtzapret, ['start', 'stop', 'restart', 'apply_profile', 'set_manual', 'start_test', 'start_test_all', 'cancel_job', 'start_flowseal_update']);
assert.equal(acl.read.ubus.luci.includes('setInitAction'), false);
assert.equal(Object.hasOwn(acl.read.file, '/etc/init.d/zapret2*'), false);
assert.equal(Object.hasOwn(acl.read.file, '/opt/zapret2/sync_config.sh*'), false);
console.log('ACL checks passed');
