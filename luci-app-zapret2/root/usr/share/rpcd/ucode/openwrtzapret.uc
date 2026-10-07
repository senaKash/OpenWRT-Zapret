import { popen, readfile } from 'fs';

const SERVICE = '/usr/libexec/openwrtzapret/service';

function invoke(action, id) {
	// Строковый вызов используется для совместимости со старыми версиями ucode; action и id проверяются перед запуском.
	let cmd = SERVICE + ' ' + action + (id == null ? '' : ' ' + id);
	let fd = popen(cmd, 'r');
	if (!fd)
		return { ok: false, error: 'backend_unavailable' };
	let output = fd.read('all');
	fd.close();
	try {
		return json(output);
	}
	catch (e) {
		return { ok: false, error: 'invalid_backend_response' };
	}
}

function validId(id) {
	return type(id) == 'string' && match(id, /^(builtin|flowseal|user)-[a-z0-9][a-z0-9_-]*$/);
}


function validJobId(id) {
	return type(id) == 'string' && match(id, /^[0-9]+-[0-9]+$/);
}

function readProfileResult(id) {
	if (!validId(id))
		return null;
	try {
		let result = json(readfile('/etc/openwrtzapret/state/results/' + id + '.json', 262144));
		if (!result || result.profile_id != id)
			return null;
		return result;
	}
	catch (e) {
		return null;
	}
}

function latestResult(profile) {
	if (!profile || !validId(profile.id))
		return null;
	let result = readProfileResult(profile.id);
	if (!result || result.content_hash != profile.content_hash || result.source_version != profile.source_version)
		return null;
	return result;
}

function getProfileResult(id) {
	if (!validId(id))
		return { ok: false, error: 'invalid_profile_id' };
	return { ok: true, result: readProfileResult(id) };
}

function getProfile(id) {
	if (!validId(id))
		return { ok: false, error: 'invalid_profile_id' };
	let result = invoke('profile_get', id);
	if (!result.ok || !result.profile || result.profile.id != id)
		return { ok: false, error: result.error || 'invalid_profile_json' };
	result.profile.latest_result = latestResult(result.profile);
	return result;
}

function listProfiles() {
	let listing = invoke('profile_list');
	if (!listing.ok)
		return listing;
	let profiles = listing.profiles || [];
	for (let i = 0; i < length(profiles); i++) {
		let profile = profiles[i];
		if (!validId(profile.id))
			continue;
		profile.latest_result = latestResult(profile);
	}
	return listing;
}

return {
	'openwrtzapret': {
		status:  { call: function() { return invoke('status'); } },
		profile_active: { call: function() { return invoke('profile_active'); } },
		start:   { call: function() { return invoke('start'); } },
		stop:    { call: function() { return invoke('stop'); } },
		restart: { call: function() { return invoke('restart'); } },
		set_manual: { call: function() { return invoke('set_manual'); } },
		list_profiles: { call: function() { return listProfiles(); } },
		get_profile: { args: { id: 'string' }, call: function(request) { return getProfile(request.args.id); } },
		get_profile_result: { args: { id: 'string' }, call: function(request) { return getProfileResult(request.args.id); } },
		apply_profile: { args: { id: 'string' }, call: function(request) {
			if (!validId(request.args.id))
				return { ok: false, profile: request.args.id, stage: 'validation', rolled_back: false, error: 'invalid_profile_id', state: 'ERROR' };
			return invoke('apply_profile', request.args.id);
		} },
		start_test: { args: { id: 'string' }, call: function(request) {
			if (!validId(request.args.id))
				return { ok: false, error: 'invalid_profile_id' };
			return invoke('job_start_profile', request.args.id);
		} },
		start_test_all: { call: function() { return invoke('job_start_all'); } },
		flowseal_status: { call: function() { return invoke('flowseal_status'); } },
		flowseal_check: { call: function() { return invoke('flowseal_check'); } },
		start_flowseal_update: { call: function() { return invoke('job_start_flowseal_update'); } },
		current_job: { call: function() { return invoke('job_current'); } },
		job_status: { args: { id: 'string' }, call: function(request) {
			if (!validJobId(request.args.id)) return { ok: false, error: 'invalid_job_id' };
			return invoke('job_status', request.args.id);
		} },
		job_result: { args: { id: 'string' }, call: function(request) {
			if (!validJobId(request.args.id)) return { ok: false, error: 'invalid_job_id' };
			return invoke('job_result', request.args.id);
		} },
		cancel_job: { args: { id: 'string' }, call: function(request) {
			if (!validJobId(request.args.id)) return { ok: false, error: 'invalid_job_id' };
			return invoke('job_cancel', request.args.id);
		} }
	}
};
