import { popen, glob, readfile } from 'fs';

const SERVICE = '/usr/libexec/openwrtzapret/service';

function invoke(action, id) {
	// Array form uses execvp(), so no shell parses either argument.
	let args = id == null ? [SERVICE, action] : [SERVICE, action, id];
	let fd = popen(args, 'r');
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

function latestResult(profile) {
	if (!profile || !validId(profile.id))
		return null;
	try {
		let result = json(readfile('/etc/openwrtzapret/state/results/' + profile.id + '.json', 262144));
		if (!result || result.profile_id != profile.id || result.content_hash != profile.content_hash || result.source_version != profile.source_version)
			return null;
		return result;
	}
	catch (e) {
		return null;
	}
}

function profileFile(id) {
	if (!validId(id))
		return null;
	let source = split(id, '-')[0];
	let base = source == 'builtin' ? '/usr/share/openwrtzapret/profiles/builtin' : '/etc/openwrtzapret/profiles/' + source;
	return base + '/' + id + '.json';
}

function getProfile(id) {
	let path = profileFile(id);
	if (!path)
		return { ok: false, error: 'invalid_profile_id' };
	let check = invoke('profile_check', id);
	if (!check.ok)
		return check;
	try {
		let profile = json(readfile(path, 65536));
		if (!profile || profile.id != id)
			return { ok: false, error: 'invalid_profile_json' };
		return { ok: true, profile: profile };
	}
	catch (e) {
		return { ok: false, error: 'invalid_profile_json' };
	}
}

function listProfiles() {
	let paths = glob('/usr/share/openwrtzapret/profiles/builtin/*.json',
	                 '/etc/openwrtzapret/profiles/flowseal/*.json',
	                 '/etc/openwrtzapret/profiles/user/*.json') || [];
	let profiles = [];
	for (let path in paths) {
		let parts = match(path, /\/([^/]+)\.json$/);
		let id = parts ? parts[1] : null;
		if (!validId(id))
			continue;
		let result = getProfile(id);
		if (result.ok) {
			result.profile.latest_result = latestResult(result.profile);
			push(profiles, result.profile);
		}
	}
	let active = invoke('profile_active');
	if (!active.ok)
		return active;
	return { ok: true, profiles: profiles, active_profile: active.profile || null };
}

return {
	'openwrtzapret': {
		status:  { call: function() { return invoke('status'); } },
		start:   { call: function() { return invoke('start'); } },
		stop:    { call: function() { return invoke('stop'); } },
		restart: { call: function() { return invoke('restart'); } },
		set_manual: { call: function() { return invoke('set_manual'); } },
		list_profiles: { call: function() { return listProfiles(); } },
		get_profile: { args: { id: 'string' }, call: function(request) { return getProfile(request.args.id); } },
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
