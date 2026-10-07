'use strict';
'require poll';
'require rpc';
'require ui';
'require view';

const listProfiles = rpc.declare({ object: 'openwrtzapret', method: 'list_profiles', expect: { '': {} }, reject: true });
const getActiveProfile = rpc.declare({ object: 'openwrtzapret', method: 'profile_active', expect: { '': {} }, reject: true });
const applyProfile = rpc.declare({ object: 'openwrtzapret', method: 'apply_profile', params: [ 'id' ], expect: { '': {} }, reject: true });
const setManual = rpc.declare({ object: 'openwrtzapret', method: 'set_manual', expect: { '': {} }, reject: true });
const startTest = rpc.declare({ object: 'openwrtzapret', method: 'start_test', params: [ 'id' ], expect: { '': {} }, reject: true });
const startTestAll = rpc.declare({ object: 'openwrtzapret', method: 'start_test_all', expect: { '': {} }, reject: true });
const currentJob = rpc.declare({ object: 'openwrtzapret', method: 'current_job', expect: { '': {} }, reject: true });
const jobStatus = rpc.declare({ object: 'openwrtzapret', method: 'job_status', params: [ 'id' ], expect: { '': {} }, reject: true });
const jobResult = rpc.declare({ object: 'openwrtzapret', method: 'job_result', params: [ 'id' ], expect: { '': {} }, reject: true });
const cancelJob = rpc.declare({ object: 'openwrtzapret', method: 'cancel_job', params: [ 'id' ], expect: { '': {} }, reject: true });
const flowsealStatus = rpc.declare({ object: 'openwrtzapret', method: 'flowseal_status', expect: { '': {} }, reject: true });
const flowsealCheck = rpc.declare({ object: 'openwrtzapret', method: 'flowseal_check', expect: { '': {} }, reject: true });
const startFlowsealUpdate = rpc.declare({ object: 'openwrtzapret', method: 'start_flowseal_update', expect: { '': {} }, reject: true });

return view.extend({
    busy: false,
    testing: false,
    profiles: [],
    activeJob: null,
    selectedProfileId: null,
    sortKey: 'name',
    sortAsc: true,

    load: function() {
        return Promise.all([listProfiles(), currentJob(), flowsealStatus()]);
    },

    canApply: function(id) {
        if (id == '__manual__') return true;
        return this.profiles.some(p => p.id == id && p.compatible === true);
    },

    canTest: function(id) {
        return id != '__manual__' && this.profiles.some(p => p.id == id && p.compatible === true);
    },

    selectProfile: function() {
        this.selectedProfileId = this.selector.value;
        this.updateButtons();
    },

    updateButtons: function() {
        let id = this.selector?.value;
        let locked = this.busy || this.testing;
        if (this.applyButton) this.applyButton.disabled = locked || !this.canApply(id);
        if (this.testButton) this.testButton.disabled = locked || !this.canTest(id);
        if (this.testAllButton) this.testAllButton.disabled = locked || !this.profiles.some(p => p.compatible === true);
        if (this.cancelButton) this.cancelButton.disabled = !this.testing || !this.activeJob;
        if (this.flowsealUpdateButton) this.flowsealUpdateButton.disabled = locked;
        for (let button of (this.rowApplyButtons || [])) button.disabled = locked || button.profileCompatible !== true;
    },

    updateActiveProfile: function(id) {
        let active = this.profiles.find(p => p.id == id);
        this.active.textContent = active ? active.name : (id || _('Manual / Settings'));
    },

    updateProfiles: function(data) {
        if (!data?.ok) {
            this.active.textContent = _('Unable to load profiles: %s').format(data?.error || 'unknown_error');
            this.profiles = [];
            this.updateButtons();
            return;
        }
        this.profiles = data.profiles || [];
        let selected = this.selectedProfileId || data.active_profile || '__manual__';
        this.selector.replaceChildren();
        this.selector.appendChild(E('option', { value: '__manual__' }, _('Manual / Settings')));
        for (let profile of this.profiles) {
            let unavailable = profile.compatible !== true;
            let attrs = { value: profile.id };
            if (unavailable) attrs.disabled = true;
            this.selector.appendChild(E('option', attrs, profile.name + (unavailable ? ' (' + _('incompatible') + ')' : '')));
        }
        this.updateActiveProfile(data.active_profile);
        this.selector.value = selected;
        if (this.selector.selectedIndex < 0) this.selector.value = '__manual__';
        this.selectedProfileId = this.selector.value;
        this.renderResults();
        this.updateButtons();
    },

    applySelected: async function(forcedId) {
        let id = forcedId || this.selector.value;
        if (this.busy || this.testing || !id || !this.canApply(id)) return;
        this.busy = true;
        this.updateButtons();
        try {
            let result = id == '__manual__' ? await setManual() : await applyProfile(id);
            if (!result?.ok) {
                let detail = [result?.stage || 'unknown', result?.error || 'unknown_error'].join(': ');
                if (result?.missing_requirement) detail += ' — ' + _('missing requirement: %s').format(result.missing_requirement);
                if (!['validation', 'lock', 'snapshot'].includes(result?.stage))
                    detail += result?.rolled_back ? ' (' + _('rolled back') + ')' : ' (' + _('rollback requires inspection') + ')';
                if (result?.state) detail += ' [' + result.state + ']';
                ui.addNotification(null, E('p', _('Strategy change failed: %s').format(detail)));
            }
            this.updateProfiles(await listProfiles());
        }
        catch (e) {
            ui.addNotification(null, E('p', _('Strategy change failed: %s').format(e.message || e)));
        }
        finally {
            this.busy = false;
            this.updateButtons();
        }
    },

    updateFlowsealInfo: function(data) {
        if (!this.flowsealLocal || !this.flowsealRemote || !this.flowsealSummary) return;
        if (!data?.ok) {
            this.flowsealRemote.textContent = _('Unavailable');
            this.flowsealSummary.textContent = data?.error || 'unknown_error';
            return;
        }
        this.flowsealLocal.textContent = data.local_version || _('Not installed');
        this.flowsealRemote.textContent = data.remote_version || _('Not checked');
        if (data.update_available === true) this.flowsealSummary.textContent = _('Update available');
        else if (data.update_available === false) this.flowsealSummary.textContent = _('Up to date');
        else if (data.report?.counts) {
            let c = data.report.counts;
            this.flowsealSummary.textContent = _('Last import: +%d / changed %d / unsupported %d').format(Number(c.added || 0), Number(c.changed || 0), Number(c.unsupported || 0));
        }
        else this.flowsealSummary.textContent = _('Remote version has not been checked yet.');
    },

    checkFlowseal: async function(silent) {
        if (this.busy || this.testing) return;
        if (!silent) { this.busy = true; this.updateButtons(); }
        try {
            let result = await flowsealCheck();
            this.updateFlowsealInfo(result);
            if (!result?.ok && !silent)
                ui.addNotification(null, E('p', _('Flowseal version check failed: %s').format(result?.error || 'unknown_error')));
        }
        catch (e) {
            if (!silent) ui.addNotification(null, E('p', _('Flowseal version check failed: %s').format(e.message || e)));
        }
        finally {
            if (!silent) { this.busy = false; this.updateButtons(); }
        }
    },

    startFlowsealSync: async function() {
        if (this.busy || this.testing) return;
        this.busy = true;
        this.updateButtons();
        try {
            let result = await startFlowsealUpdate();
            if (!result?.ok) {
                ui.addNotification(null, E('p', _('Unable to start Flowseal update: %s').format(result?.error || 'unknown_error')));
            }
            else {
                this.activeJob = result.job_id;
                this.testing = true;
                this.showJob({ job_id: result.job_id, mode: 'flowseal_update', status: result.status || 'PENDING', index: 0, total: 1, stage: 'queued' });
            }
        }
        catch (e) {
            ui.addNotification(null, E('p', _('Unable to start Flowseal update: %s').format(e.message || e)));
        }
        finally {
            this.busy = false;
            this.updateButtons();
        }
    },

    startTesting: async function(all) {
        if (this.busy || this.testing) return;
        let id = this.selector.value;
        if (!all && !this.canTest(id)) return;
        this.busy = true;
        this.updateButtons();
        try {
            let result = all ? await startTestAll() : await startTest(id);
            if (!result?.ok) {
                ui.addNotification(null, E('p', _('Unable to start strategy test: %s').format(result?.error || 'unknown_error')));
                if (result?.job_id) this.activeJob = result.job_id;
            }
            else {
                this.activeJob = result.job_id;
                this.testing = true;
                this.showJob({ job_id: result.job_id, status: result.status || 'PENDING', index: 0, total: result.total || 1, stage: 'queued' });
            }
        }
        catch (e) {
            ui.addNotification(null, E('p', _('Unable to start strategy test: %s').format(e.message || e)));
        }
        finally {
            this.busy = false;
            this.updateButtons();
        }
    },

    cancelTesting: async function() {
        if (!this.activeJob || !this.testing) return;
        try {
            let result = await cancelJob(this.activeJob);
            if (!result?.ok)
                ui.addNotification(null, E('p', _('Cancel request failed: %s').format(result?.error || 'unknown_error')));
            else
                this.jobText.textContent = _('Cancellation requested…');
        }
        catch (e) {
            ui.addNotification(null, E('p', _('Cancel request failed: %s').format(e.message || e)));
        }
    },

    isTerminal: function(status) {
        return ['DONE', 'CANCELLED', 'ERROR', 'RECOVERED'].includes(status);
    },

    profileLabel: function(id) {
        let profile = this.profiles.find(p => p.id == id);
        return profile ? profile.name : id;
    },

    showJob: function(data) {
        if (!data?.job_id) {
            this.jobText.textContent = _('No strategy test is running.');
            return;
        }
        let index = Number(data.index || 0), total = Number(data.total || 0);
        let current = data.current_profile ? ' — ' + this.profileLabel(data.current_profile) : '';
        if (data.mode == 'flowseal_update') {
            if (data.status == 'PENDING') this.jobText.textContent = _('Flowseal update queued');
            else if (data.status == 'RUNNING') this.jobText.textContent = _('Updating Flowseal strategies…');
            else this.jobText.textContent = _('Flowseal update: %s').format(data.status || 'UNKNOWN');
        }
        else if (data.status == 'RUNNING' && data.stage == 'testing')
            this.jobText.textContent = _('Testing %d/%d').format(index, total) + current;
        else if (data.status == 'PENDING')
            this.jobText.textContent = _('Queued') + (total > 0 ? ' · ' + total + ' ' + _('strategy tests') : '');
        else
            this.jobText.textContent = (data.status || 'UNKNOWN') + (total > 0 ? ' ' + index + '/' + total : '') + current + ' [' + (data.stage || 'unknown') + ']';
    },

    refreshJob: async function() {
        try {
            if (!this.activeJob) {
                let current = await currentJob();
                if (current?.job_id) {
                    this.activeJob = current.job_id;
                    this.testing = !this.isTerminal(current.status);
                    this.showJob(current);
                    this.updateButtons();
                }
                else if (current?.ok) {
                    let active = await getActiveProfile();
                    if (active?.ok) this.updateActiveProfile(active.profile);
                }
                return;
            }
            let state = await jobStatus(this.activeJob);
            if (!state?.ok) return;
            this.showJob(state);
            this.testing = !this.isTerminal(state.status);
            if (!this.testing) {
                let id = this.activeJob;
                this.activeJob = null;
                let result = await jobResult(id);
                if (state.mode == 'flowseal_update') {
                    if (result?.ok && result.status == 'DONE') {
                        let c = result.report?.counts || {};
                        ui.addNotification(null, E('p', _('Flowseal updated: added %d, changed %d, unchanged %d, unsupported %d.').format(Number(c.added || 0), Number(c.changed || 0), Number(c.unchanged || 0), Number(c.unsupported || 0))));
                    }
                    else if (state.status == 'CANCELLED')
                        ui.addNotification(null, E('p', _('Flowseal update cancelled.')));
                    else
                        ui.addNotification(null, E('p', _('Flowseal update failed: %s').format(result?.error || state.error || 'unknown_error')));
                    this.updateFlowsealInfo(await flowsealStatus());
                    this.checkFlowseal(true);
                }
                else {
                    if (result?.ok && result.status == 'ERROR')
                        ui.addNotification(null, E('p', _('Strategy test recovery failed: %s').format(result.error || 'unknown_error')));
                    else if (result?.ok && result.status == 'RECOVERED')
                        ui.addNotification(null, E('p', _('The strategy test was interrupted; the previous configuration was recovered.')));
                }
                this.updateProfiles(await listProfiles());
            }
            this.updateButtons();
        }
        catch (e) { /* polling retries */ }
    },

    testCell: function(test) {
        if (!test) return _('Not tested');
        let text = test.status || 'UNKNOWN';
        if (Number.isFinite(test.latency_ms)) text += ' · ' + test.latency_ms + ' ms';
        if (test.transport) text += ' · ' + test.transport;
        return text;
    },

    setSort: function(key) {
        if (this.sortKey == key) this.sortAsc = !this.sortAsc;
        else { this.sortKey = key; this.sortAsc = true; }
        this.renderResults();
    },

    renderResults: function() {
        if (!this.resultsBody) return;
        this.resultsBody.replaceChildren();
        this.rowApplyButtons = [];
        let profiles = Array.from(this.profiles);
        let key = this.sortKey, direction = this.sortAsc ? 1 : -1;
        profiles.sort((a, b) => {
            let av, bv;
            if (key == 'result') { av = a.latest_result?.status || 'ZZZ'; bv = b.latest_result?.status || 'ZZZ'; }
            else if (key == 'tested') { av = Number(a.latest_result?.tested_at || 0); bv = Number(b.latest_result?.tested_at || 0); }
            else { av = a.name || a.id; bv = b.name || b.id; }
            if (typeof av == 'number') return direction * (av - bv);
            return direction * String(av).localeCompare(String(bv));
        });
        for (let profile of profiles) {
            let result = profile.latest_result;
            let tests = result?.tests || {};
            let resultText = result?.status || _('Not tested');
            if (result?.reason) resultText += ' — ' + result.reason;
            let apply = E('button', {
                'class': 'btn cbi-button-apply',
                'disabled': profile.compatible !== true || this.testing,
                'click': L.bind(this.applySelected, this, profile.id)
            }, _('Apply'));
            apply.profileCompatible = profile.compatible === true;
            this.rowApplyButtons.push(apply);
            this.resultsBody.appendChild(E('tr', [
                E('td', profile.name),
                E('td', resultText),
                E('td', result?.tested_at ? new Date(result.tested_at * 1000).toLocaleString() : '—'),
                E('td', this.testCell(tests.youtube)),
                E('td', this.testCell(tests.discord)),
                E('td', this.testCell(tests.cloudflare)),
                E('td', this.testCell(tests.github)),
                E('td', apply)
            ]));
        }
    },

    render: function(data) {
        this.active = E('span');
        this.selector = E('select', { 'change': L.bind(this.selectProfile, this) });
        this.applyButton = E('button', { 'class': 'btn cbi-button-apply', 'click': L.bind(this.applySelected, this, null) }, _('Apply'));
        this.testButton = E('button', { 'class': 'btn cbi-button-action', 'click': L.bind(this.startTesting, this, false) }, _('Test Strategy'));
        this.testAllButton = E('button', { 'class': 'btn cbi-button-action', 'click': L.bind(this.startTesting, this, true) }, _('Test All Strategies'));
        this.cancelButton = E('button', { 'class': 'btn cbi-button-negative', 'click': L.bind(this.cancelTesting, this) }, _('Cancel Job'));
        this.jobText = E('span', _('No background job is running.'));
        this.flowsealLocal = E('span', '—');
        this.flowsealRemote = E('span', '—');
        this.flowsealSummary = E('span', '—');
        this.flowsealUpdateButton = E('button', { 'class': 'btn cbi-button-apply', 'click': L.bind(this.startFlowsealSync, this) }, _('Update Strategies'));
        this.resultsBody = E('tbody');

        let page = E('div', [
            E('h2', _('Strategies')),
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Active strategy')),
                    E('div', { 'class': 'cbi-value-field' }, this.active)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Strategy')),
                    E('div', { 'class': 'cbi-value-field', 'style': 'display:flex;flex-wrap:wrap;gap:.5rem' }, [
                        this.selector, this.applyButton, this.testButton, this.testAllButton
                    ])
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Background job')),
                    E('div', { 'class': 'cbi-value-field' }, [this.jobText, ' ', this.cancelButton])
                ]),
                E('p', { 'class': 'cbi-value-description' }, _('Tests temporarily activate a strategy, check HTTPS reachability, and restore the previous configuration.'))
            ]),
            E('div', { 'class': 'cbi-section' }, [
                E('h3', _('Strategy updates')),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Local version')),
                    E('div', { 'class': 'cbi-value-field' }, this.flowsealLocal)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Remote stable version')),
                    E('div', { 'class': 'cbi-value-field' }, this.flowsealRemote)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Status')),
                    E('div', { 'class': 'cbi-value-field' }, this.flowsealSummary)
                ]),
                E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5rem' }, [ this.flowsealUpdateButton ]),
                E('p', { 'class': 'cbi-value-description' }, _('Source: Flowseal. Strategy BAT files are imported as inert data and are never executed. Windows executables are never run, and updating never changes the active strategy automatically.'))
            ]),
            E('div', { 'class': 'cbi-section', 'style': 'overflow-x:auto' }, [
                E('h3', _('Strategy test results')),
                E('table', { 'class': 'table' }, [
                    E('thead', {}, [ E('tr', {}, [
                        E('th', { 'style': 'cursor:pointer', 'click': L.bind(this.setSort, this, 'name'), 'title': _('Sort') }, _('Strategy')),
                        E('th', { 'style': 'cursor:pointer', 'click': L.bind(this.setSort, this, 'result'), 'title': _('Sort') }, _('Result')),
                        E('th', { 'style': 'cursor:pointer', 'click': L.bind(this.setSort, this, 'tested'), 'title': _('Sort') }, _('Tested')),
                        E('th', {}, _('YouTube')), E('th', {}, _('Discord')),
                        E('th', {}, _('Cloudflare')), E('th', {}, _('GitHub')), E('th', {}, _('Action'))
                    ]) ]),
                    this.resultsBody
                ])
            ])
        ]);

        let profiles = data?.[0] || {};
        let job = data?.[1] || {};
        let flowseal = data?.[2] || {};
        this.updateProfiles(profiles);
        this.updateFlowsealInfo(flowseal);
        if (job?.job_id) {
            this.activeJob = job.job_id;
            this.testing = !this.isTerminal(job.status);
            this.showJob(job);
        }
        this.updateButtons();
        if (!this.testing) this.checkFlowseal(true);
        poll.add(L.bind(this.refreshJob, this), 2);
        return page;
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
