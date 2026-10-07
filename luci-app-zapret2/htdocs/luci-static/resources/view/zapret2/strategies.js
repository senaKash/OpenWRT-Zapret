'use strict';
'require poll';
'require rpc';
'require ui';
'require view';

const listProfiles = rpc.declare({ object: 'openwrtzapret', method: 'list_profiles', expect: { '': {} }, reject: true });
const getProfileResult = rpc.declare({ object: 'openwrtzapret', method: 'get_profile_result', params: [ 'id' ], expect: { '': {} }, reject: true });
const getStatus = rpc.declare({ object: 'openwrtzapret', method: 'status', expect: { '': {} }, reject: true });
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
const setProfileLock = rpc.declare({ object: 'openwrtzapret', method: 'set_profile_lock', params: [ 'id', 'locked' ], expect: { '': {} }, reject: true });
const deleteProfile = rpc.declare({ object: 'openwrtzapret', method: 'delete_profile', params: [ 'id' ], expect: { '': {} }, reject: true });

document.head.appendChild(E('link', {
    rel: 'stylesheet',
    href: L.resource('view/zapret2/strategies.css') + '?v=25'
}));

return view.extend({
    busy: false,
    testing: false,
    profiles: [],
    profilesLoaded: false,
    activeJob: null,
    selectedProfileId: null,
    sortKey: 'name',
    sortAsc: true,
    runtimeState: 'ERROR',
    lastIdleRefresh: 0,
    idleRefreshMs: 10000,

    load: function() {
        // Список профилей проверяется backend долго; таблица заполняется после первого render.
        return Promise.all([currentJob().catch(() => null), getStatus().catch(() => null)]);
    },

    loadProfiles: function() {
        return listProfiles().then(data => this.updateProfiles(data)).catch(e =>
            this.updateProfiles({ ok: false, error: e?.message || String(e) }));
    },

    badgeClass: function(value) {
        let kind = String(value || '').toUpperCase();
        let color = {
            RUNNING: 'pass', PASS: 'pass',
            PARTIAL: 'partial',
            FAIL: 'fail', ERROR: 'fail',
            TESTING: 'testing',
            STOPPED: 'skip', SKIP: 'skip'
        }[kind] || 'neutral';
        return 'owz-badge owz-badge-' + color;
    },

    badge: function(value, title) {
        return E('span', { 'class': this.badgeClass(value), 'title': title || '' }, value);
    },

    helpIcon: function(message) {
        return E('span', { 'class': 'owz-help-icon', 'title': message, 'tabindex': 0, 'aria-label': message }, '?');
    },

    setRuntimeState: function(status) {
        let valid = status && !status.error &&
            ['running', 'daemon', 'firewall', 'nfqueue', 'partial'].every(key => typeof status[key] == 'boolean');
        if (valid && status.running && status.daemon && status.firewall && status.nfqueue && !status.partial)
            this.runtimeState = 'RUNNING';
        else if (valid && !status.running && !status.daemon && !status.firewall && !status.nfqueue && !status.partial)
            this.runtimeState = 'STOPPED';
        else
            this.runtimeState = 'ERROR';
        this.updateStateBadge();
    },

    updateStateBadge: function() {
        if (!this.stateBadge) return;
        let state = this.jobState?.status == 'RUNNING' && this.jobState.mode != 'flowseal_update'
            ? 'TESTING' : this.runtimeState;
        this.stateBadge.className = this.badgeClass(state);
        this.stateBadge.textContent = state;
        this.updateActiveBadge();
    },

    updateActiveBadge: function() {
        if (!this.active) return;
        let strategyJob = this.jobState && !this.isTerminal(this.jobState.status) && this.jobState.mode != 'flowseal_update';
        this.active.className = this.badgeClass(this.runtimeState == 'RUNNING' && !strategyJob ? 'RUNNING' : 'neutral');
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
        if (this.applyButton) this.applyButton.disabled = locked || !this.profilesLoaded || !this.canApply(id);
        if (this.testButton) this.testButton.disabled = locked || !this.profilesLoaded || !this.canTest(id);
        if (this.testAllButton) this.testAllButton.disabled = locked || !this.profilesLoaded || !this.profiles.some(p => p.compatible === true);
        if (this.cancelButton) this.cancelButton.disabled = !this.testing || !this.activeJob;
        if (this.flowsealUpdateButton) this.flowsealUpdateButton.disabled = locked;
        for (let button of (this.rowLockButtons || [])) button.disabled = locked;
        for (let button of (this.rowDeleteButtons || []))
            button.disabled = locked || button.profileLocked === true || button.profileId == this.activeProfileId;
    },

    updateActiveProfile: function(id) {
        let previousId = this.activeProfileId;
        this.activeProfileId = id || null;
        let active = this.profiles.find(p => p.id == id);
        this.active.textContent = active ? active.name : (id || _('Manual mode'));
        this.updateActiveBadge();
        if (previousId && previousId != id) this.updateResultRow(previousId);
        if (id) this.updateResultRow(id);
    },

    updateProfiles: function(data) {
        if (!data?.ok) {
            this.profilesLoaded = false;
            let message = _('Unable to load profiles: %s').format(data?.error || 'unknown_error');
            this.active.textContent = message;
            this.profiles = [];
            this.resultsBody?.replaceChildren(E('tr', {}, E('td', { 'colspan': 10, 'class': 'owz-loading-cell' }, message)));
            this.updateButtons();
            return;
        }
        this.profilesLoaded = true;
        this.profiles = data.profiles || [];
        let selected = this.selectedProfileId || data.active_profile || '__manual__';
        this.selector.replaceChildren();
        this.selector.appendChild(E('option', { value: '__manual__' }, _('Manual mode')));
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

    updateProfileResult: function(id, result) {
        let current = this.profiles.find(p => p.id == id);
        if (!current) return;

        // Результат относится только к той версии профиля, которая уже загружена в UI.
        let latest = result && result.profile_id == id &&
            result.content_hash == current.content_hash &&
            result.source_version == current.source_version ? result : null;

        if (JSON.stringify(current.latest_result || null) == JSON.stringify(latest || null)) return;
        current.latest_result = latest;
        this.updateResultRow(current.id);
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

    toggleProfileLock: async function(id) {
        let profile = this.profiles.find(p => p.id == id);
        if (!profile || this.busy || this.testing) return;
        let newState = profile.locked !== true;
        this.busy = true;
        this.updateButtons();
        try {
            let result = await setProfileLock(id, newState);
            if (!result?.ok || result.profile != id || result.locked !== newState) {
                ui.addNotification(null, E('p', _('Unable to change strategy lock: %s').format(result?.error || 'invalid_backend_response')));
            }
            else {
                profile.locked = newState;
                let entry = this.resultRows?.[id];
                if (entry) {
                    entry.lock.textContent = newState ? '🔒' : '🔓';
                    entry.lock.title = newState ? _('Strategy locked') : _('Strategy unlocked');
                    entry.lock.setAttribute('aria-label', newState ? _('Unlock strategy') : _('Lock strategy'));
                    entry.remove.profileLocked = newState;
                }
            }
        }
        catch (e) {
            ui.addNotification(null, E('p', _('Unable to change strategy lock: %s').format(e.message || e)));
        }
        finally { this.busy = false; this.updateButtons(); }
    },

    removeProfile: async function(id) {
        let profile = this.profiles.find(p => p.id == id);
        if (!profile || profile.locked === true || this.busy || this.testing) return;
        if (id == this.activeProfileId) {
            ui.addNotification(null, E('p', _('Switch to another strategy before deleting the active one.')));
            return;
        }
        this.busy = true;
        this.updateButtons();
        try {
            let result = await deleteProfile(id);
            if (!result?.ok || result.profile != id)
                ui.addNotification(null, E('p', _('Unable to delete strategy: %s').format(result?.error || 'invalid_backend_response')));
            else {
                this.profiles = this.profiles.filter(p => p.id != id);
                this.updateProfiles({ ok: true, profiles: this.profiles, active_profile: this.activeProfileId });
            }
        }
        catch (e) {
            ui.addNotification(null, E('p', _('Unable to delete strategy: %s').format(e.message || e)));
        }
        finally { this.busy = false; this.updateButtons(); }
    },

    updateFlowsealInfo: function(data) {
        if (!this.flowsealLocal || !this.flowsealRemote || !this.flowsealSummary) return;
        if (!data?.ok) {
            this.flowsealRemote.textContent = _('Unavailable');
            this.flowsealSummary.textContent = data?.error || 'unknown_error';
            this.flowsealSummary.className = this.badgeClass('ERROR');
            return;
        }
        this.flowsealLocal.textContent = data.local_version || _('Not installed');
        this.flowsealRemote.textContent = data.remote_version || _('Not checked');
        if (data.update_available === true) {
            this.flowsealSummary.textContent = _('Update available');
            this.flowsealSummary.className = this.badgeClass('PARTIAL');
        }
        else if (data.update_available === false) {
            this.flowsealSummary.textContent = _('Up to date');
            this.flowsealSummary.className = this.badgeClass('PASS');
        }
        else if (data.report?.counts) {
            let c = data.report.counts;
            this.flowsealSummary.textContent = _('Last import: +%d / changed %d / unsupported %d').format(Number(c.added || 0), Number(c.changed || 0), Number(c.unsupported || 0));
            this.flowsealSummary.className = this.badgeClass('neutral');
        }
        else {
            this.flowsealSummary.textContent = _('Not checked');
            this.flowsealSummary.className = this.badgeClass('neutral');
        }
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
                this.showJob({ job_id: result.job_id, mode: 'flowseal_update', status: result.status || 'PENDING', current: 0, total: 1, stage: 'queued' });
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
                this.showJob({ job_id: result.job_id, status: result.status || 'PENDING', current: 0, total: result.total || 1, stage: 'queued' });
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
        let previous = this.jobState?.status == 'RUNNING' && this.jobState.stage == 'testing'
            ? (this.jobState.profile_id || this.jobState.current_profile) : null;
        if (!data?.job_id) {
            this.jobState = null;
            this.jobText.textContent = _('None');
            this.jobProgressRow.hidden = true;
            this.updateStateBadge();
            if (previous) this.updateResultRow(previous);
            return;
        }
        this.jobState = data;
        let current = Number(data.current ?? data.index ?? 0), total = Number(data.total || 0);
        let profileId = data.profile_id || data.current_profile;
        let label = profileId ? ' — ' + this.profileLabel(profileId) : '';
        let scope = data.mode == 'all'
            ? ' · ' + (this.profilesLoaded && this.profiles.length > total
                ? _('%d of %d strategies compatible').format(total, this.profiles.length)
                : _('compatible strategies only')) : '';
        let complete = data.status == 'DONE' && current >= total;
        let percent = total > 0 ? Math.max(0, Math.min(100, Math.round(current * 100 / total))) : 0;
        if (!complete) percent = Math.min(percent, 99);
        let filled = Math.floor(percent * 24 / 100);
        this.jobProgress.textContent = '[' + '#'.repeat(filled) + '.'.repeat(24 - filled) + ']';
        this.jobProgress.setAttribute('aria-valuenow', percent);
        this.jobPercent.textContent = percent + '%';
        this.jobProgressRow.hidden = false;
        this.cancelButton.hidden = this.isTerminal(data.status);
        if (data.mode == 'flowseal_update') {
            if (data.status == 'PENDING') this.jobText.textContent = _('Flowseal update queued');
            else if (data.status == 'RUNNING') this.jobText.textContent = _('Updating Flowseal strategies…');
            else this.jobText.textContent = _('Flowseal update: %s').format(data.status || 'UNKNOWN');
        }
        else if (data.status == 'RUNNING' && data.stage == 'testing')
            this.jobText.textContent = _('Completed %d / %d').format(current, total) +
                (profileId ? ' · ' + _('Testing %s').format(this.profileLabel(profileId)) : '') + scope;
        else if (data.status == 'RUNNING' && data.stage == 'result')
            this.jobText.textContent = _('Completed %d / %d').format(current, total) + label + scope;
        else if (data.status == 'RUNNING' && data.stage == 'restoring')
            this.jobText.textContent = _('Restoring previous configuration') + ' · ' +
                _('Completed %d / %d').format(current, total) + scope;
        else if (data.status == 'PENDING')
            this.jobText.textContent = _('Queued') + (total > 0 ? ' · ' + total + ' ' + _('strategy tests') : '') + scope;
        else if (data.status == 'DONE')
            this.jobText.textContent = _('DONE') + ' · ' + _('Completed %d / %d').format(current, total) + scope;
        else
            this.jobText.textContent = (data.status || 'UNKNOWN') + (total > 0 ? ' ' + current + '/' + total : '') + label + ' [' + (data.stage || 'unknown') + ']' + scope;
        this.updateStateBadge();
        let testing = data.status == 'RUNNING' && data.stage == 'testing' ? profileId : null;
        if (previous && previous != testing) this.updateResultRow(previous);
        if (testing) this.updateResultRow(testing);
    },

    refreshRuntimeAndActive: async function() {
        let [status, active] = await Promise.all([
            getStatus().catch(() => null),
            getActiveProfile().catch(() => null)
        ]);
        this.setRuntimeState(status);
        if (active?.ok) this.updateActiveProfile(active.profile);
    },

    refreshIdle: async function(force) {
        let now = Date.now();
        if (!force && this.lastIdleRefresh && now - this.lastIdleRefresh < this.idleRefreshMs)
            return;
        this.lastIdleRefresh = now;
        let [status, current, active] = await Promise.all([
            getStatus().catch(() => null),
            currentJob().catch(() => null),
            getActiveProfile().catch(() => null)
        ]);
        this.setRuntimeState(status);
        if (active?.ok) this.updateActiveProfile(active.profile);
        if (current?.job_id) {
            this.activeJob = current.job_id;
            this.testing = !this.isTerminal(current.status);
            this.showJob(current);
        }
        else if (current?.ok) {
            this.showJob(null);
            this.testing = false;
        }
        this.updateButtons();
    },

    refreshJob: async function() {
        try {
            // В idle нет смысла будить backend каждые 2 секунды.
            if (!this.activeJob) {
                await this.refreshIdle(false);
                return;
            }

            // Во время job быстрый polling читает только состояние самого job.
            let state = await jobStatus(this.activeJob);
            if (!state?.ok) return;
            let previousId = this.jobState?.profile_id || this.jobState?.current_profile;
            let completedPrevious = state.mode != 'flowseal_update' && this.jobState?.stage == 'testing' && previousId &&
                (previousId != (state.profile_id || state.current_profile) || state.stage == 'result' || this.isTerminal(state.status));

            let terminal = this.isTerminal(state.status);
            if (!terminal) this.showJob(state);
            if (completedPrevious) {
                try {
                    let completed = await getProfileResult(previousId);
                    if (completed?.ok) this.updateProfileResult(previousId, completed.result);
                }
                catch (e) { /* Следующий переход job повторит чтение результата. */ }
            }

            if (terminal) {
                let id = this.activeJob;
                let result = await jobResult(id);
                if (state.status == 'DONE' && (!result?.ok ||
                    (state.mode != 'flowseal_update' && (!Array.isArray(result.results) ||
                        result.results.length < Number(state.total || 0))))) return;
                this.activeJob = null;
                this.testing = false;
                if (state.mode == 'flowseal_update') {
                    this.showJob(state);
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
                    this.updateProfiles(await listProfiles());
                }
                else {
                    if (Array.isArray(result?.results))
                        for (let completed of result.results)
                            this.updateProfileResult(completed.profile_id, completed);
                    this.showJob(state);
                    if (result?.ok && result.status == 'ERROR')
                        ui.addNotification(null, E('p', _('Strategy test recovery failed: %s').format(result.error || 'unknown_error')));
                    else if (result?.ok && result.status == 'RECOVERED')
                        ui.addNotification(null, E('p', _('The strategy test was interrupted; the previous configuration was recovered.')));
                }
                // После завершения job один раз перечитываем реальное состояние runtime и active profile.
                await this.refreshRuntimeAndActive();
                this.lastIdleRefresh = Date.now();
            }
            else this.testing = true;
            this.updateButtons();
        }
        catch (e) { /* polling retries */ }
    },

    testCell: function(test) {
        if (!test) return '—';
        let detail = Number.isFinite(test.latency_ms) ? test.latency_ms + ' ms' : '';
        if (test.transport) detail += (detail ? ' · ' : '') + test.transport;
        return this.badge(test.status || _('Not tested'), detail);
    },

    setSort: function(key) {
        if (this.sortKey == key) this.sortAsc = !this.sortAsc;
        else { this.sortKey = key; this.sortAsc = true; }
        this.renderResults();
    },

    updateResultRow: function(id) {
        let entry = this.resultRows?.[id];
        let profile = this.profiles.find(p => p.id == id);
        if (!entry || !profile) return;
        let result = profile.latest_result;
        let tests = result?.tests || {};
        let isTesting = this.jobState?.status == 'RUNNING' && this.jobState.stage == 'testing' &&
            (this.jobState.profile_id || this.jobState.current_profile) == id;
        entry.row.className = [
            id == this.activeProfileId ? 'owz-active-strategy' : '',
            isTesting ? 'owz-current-row' : ''
        ].filter(Boolean).join(' ');
        let status = isTesting ? 'TESTING' : (result?.status || _('Not tested'));
        entry.result.replaceChildren(this.badge(status));
        if (!isTesting && result?.reason)
            entry.result.appendChild(E('small', { 'class': 'owz-result-reason', 'title': result.reason }, result.reason));
        for (let name of ['youtube', 'discord', 'cloudflare', 'github'])
            entry[name].replaceChildren(this.testCell(tests[name]));
        entry.tested.textContent = result?.tested_at ? new Date(result.tested_at * 1000).toLocaleString() : '—';
    },

    renderResults: function() {
        if (!this.resultsBody) return;
        this.resultsBody.replaceChildren();
        this.resultRows = Object.create(null);
        this.rowLockButtons = [];
        this.rowDeleteButtons = [];
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
        for (let index = 0; index < profiles.length; index++) {
            let profile = profiles[index];
            let lock = E('button', {
                'class': 'btn owz-icon-button owz-lock-button',
                'title': profile.locked === true ? _('Strategy locked') : _('Strategy unlocked'),
                'aria-label': profile.locked === true ? _('Unlock strategy') : _('Lock strategy'),
                'click': L.bind(this.toggleProfileLock, this, profile.id)
            }, profile.locked === true ? '🔒' : '🔓');
            lock.profileId = profile.id;
            this.rowLockButtons.push(lock);
            let remove = E('button', {
                'class': 'btn owz-icon-button owz-delete-button',
                'title': _('Delete strategy'),
                'aria-label': _('Delete strategy'),
                'disabled': profile.locked === true || profile.id == this.activeProfileId,
                'click': L.bind(this.removeProfile, this, profile.id)
            }, '🗑');
            remove.profileId = profile.id;
            remove.profileLocked = profile.locked === true;
            this.rowDeleteButtons.push(remove);
            let entry = {
                lock: lock, remove: remove,
                result: E('td', { 'class': 'owz-result-cell' }),
                youtube: E('td', { 'class': 'owz-probe-cell' }),
                discord: E('td', { 'class': 'owz-probe-cell' }),
                cloudflare: E('td', { 'class': 'owz-probe-cell' }),
                github: E('td', { 'class': 'owz-probe-cell' }),
                tested: E('td', { 'class': 'owz-tested-cell' })
            };
            entry.row = E('tr', {}, [
                E('td', { 'class': 'owz-index-cell' }, String(index + 1)),
                E('td', { 'class': 'owz-lock-cell' }, lock),
                E('td', { 'class': 'owz-strategy-cell', 'title': profile.name }, profile.name),
                entry.result, entry.youtube, entry.discord,
                entry.cloudflare, entry.github, entry.tested,
                E('td', { 'class': 'owz-action-cell' }, remove)
            ]);
            this.resultRows[profile.id] = entry;
            this.resultsBody.appendChild(entry.row);
            this.updateResultRow(profile.id);
        }
    },

    render: function(data) {
        this.active = this.badge(_('Loading strategies…'));
        this.stateBadge = this.badge('ERROR');
        this.selector = E('select', { 'change': L.bind(this.selectProfile, this) });
        this.selector.appendChild(E('option', { value: '' }, _('Loading strategies…')));
        this.applyButton = E('button', { 'class': 'btn cbi-button-apply', 'click': L.bind(this.applySelected, this, null) }, _('Apply'));
        this.testButton = E('button', { 'class': 'btn cbi-button-action', 'click': L.bind(this.startTesting, this, false) }, _('Test Selected'));
        this.testAllButton = E('button', { 'class': 'btn cbi-button-action', 'click': L.bind(this.startTesting, this, true) }, _('Test All'));
        this.cancelButton = E('button', { 'class': 'btn cbi-button-negative', 'click': L.bind(this.cancelTesting, this) }, _('Cancel'));
        this.jobText = E('span', _('None'));
        this.jobProgress = E('span', { 'class': 'owz-ascii-progress', 'role': 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, '[........................]');
        this.jobPercent = E('span', '0%');
        this.jobProgressRow = E('div', { 'class': 'owz-job-progress' }, [this.jobProgress, this.jobPercent, this.cancelButton]);
        this.jobProgressRow.hidden = true;
        this.flowsealLocal = E('span', '—');
        this.flowsealRemote = E('span', '—');
        this.flowsealSummary = this.badge(_('Not checked'));
        this.flowsealUpdateButton = E('button', { 'class': 'btn cbi-button-apply', 'click': L.bind(this.startFlowsealSync, this) }, _('Update Strategies'));
        this.resultsBody = E('tbody');

        let page = E('div', [
            E('div', { 'class': 'owz-top-layout' }, [
            E('div', { 'class': 'owz-top-column' }, [
            E('div', { 'class': 'cbi-section owz-control-section' }, [
                E('h2', _('Selected Strategy')),
                E('div', { 'class': 'owz-status-line' }, [
                    E('span', [ _('Active:'), ' ', this.active ]),
                    E('span', [ _('State:'), ' ', this.stateBadge ])
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Strategy')),
                    E('div', { 'class': 'cbi-value-field' }, this.selector)
                ]),
                E('div', { 'class': 'owz-actions' }, [this.applyButton, this.testButton])
            ]),
            E('p', { 'class': 'cbi-value-description owz-strategy-note' }, _('Tests temporarily activate a strategy, check HTTPS from the router, and restore the previous configuration. LAN client traffic may differ.')),
            E('div', { 'class': 'owz-job-panel' }, [
                E('div', { 'class': 'owz-job-line' }, [
                    E('span', { 'class': 'owz-job-prompt' }, '$'),
                    E('span', { 'class': 'owz-job-label' }, _('Job') + ':'),
                    this.jobText
                ]),
                this.jobProgressRow
            ])
            ]),
            E('div', { 'class': 'owz-top-column' }, [
            E('div', { 'class': 'cbi-section owz-updates-section' }, [
                E('div', { 'class': 'owz-updates-header' }, [
                    E('h2', _('Updates')),
                    E('div', { 'class': 'owz-header-actions' }, [
                        this.helpIcon(_('Update Strategies imports supported strategies from Flowseal. It never changes the active strategy automatically.')),
                        this.flowsealUpdateButton
                    ])
                ]),
                E('div', { 'class': 'owz-updates-body' }, [
                E('div', { 'class': 'owz-updates-values' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Local')),
                    E('div', { 'class': 'cbi-value-field' }, this.flowsealLocal)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Remote')),
                    E('div', { 'class': 'cbi-value-field' }, this.flowsealRemote)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Status')),
                    E('div', { 'class': 'cbi-value-field' }, this.flowsealSummary)
                ])
                ]),
                E('div', { 'class': 'owz-import-action' },
                    E('a', { 'href': L.url('admin/services/zapret2/import'), 'class': 'btn cbi-button-apply owz-import-button' }, _('Import your strategy'))
                )
                ])
            ]),
            E('p', { 'class': 'cbi-value-description owz-source-note' }, [
                _('You can import a general*.bat strategy from '),
                E('a', { 'href': 'https://github.com/Flowseal/zapret-discord-youtube', 'target': '_blank', 'rel': 'noopener noreferrer' }, 'Flowseal/zapret-discord-youtube'),
                _('. Choose the BAT file on Import Strategy or paste its contents. The BAT is read as data and never executed.')
            ])
            ])
            ]),
            E('div', { 'class': 'cbi-section owz-tests-section' }, [
                E('div', { 'class': 'owz-section-heading' }, [
                    E('div', { 'class': 'owz-title-help' }, [
                        E('h2', _('Strategies')),
                        this.helpIcon(_('Lock protects a strategy from deletion and from being replaced or removed by Update Strategies. Test All includes compatible strategies only.'))
                    ]),
                    this.testAllButton
                ]),
                E('div', { 'class': 'owz-results-wrap' }, [
                    E('table', { 'class': 'table owz-results-table' }, [
                        E('colgroup', {}, [
                            E('col', { 'class': 'owz-col-index' }),
                            E('col', { 'class': 'owz-col-lock' }),
                            E('col', { 'class': 'owz-col-strategy' }),
                            E('col', { 'class': 'owz-col-result' }),
                            E('col', { 'class': 'owz-col-probe' }),
                            E('col', { 'class': 'owz-col-probe' }),
                            E('col', { 'class': 'owz-col-probe' }),
                            E('col', { 'class': 'owz-col-probe' }),
                            E('col', { 'class': 'owz-col-tested' }),
                            E('col', { 'class': 'owz-col-action' })
                        ]),
                        E('thead', {}, [ E('tr', {}, [
                            E('th', { 'class': 'owz-index-cell' }, '#'),
                            E('th', { 'class': 'owz-lock-cell' }, _('Lock')),
                            E('th', { 'class': 'owz-sortable', 'click': L.bind(this.setSort, this, 'name'), 'title': _('Sort') }, _('Strategy')),
                            E('th', { 'class': 'owz-sortable', 'click': L.bind(this.setSort, this, 'result'), 'title': _('Sort') }, _('Result')),
                            E('th', { 'class': 'owz-probe-cell' }, _('YouTube')), E('th', { 'class': 'owz-probe-cell' }, _('Discord')),
                            E('th', { 'class': 'owz-probe-cell' }, _('Cloudflare')), E('th', { 'class': 'owz-probe-cell' }, _('GitHub')),
                            E('th', { 'class': 'owz-sortable', 'click': L.bind(this.setSort, this, 'tested'), 'title': _('Sort') }, _('Tested')),
                            E('th', { 'class': 'owz-action-cell' }, _('Del'))
                        ]) ]),
                        this.resultsBody
                    ])
                ])
            ])
        ]);

        let job = data?.[0] || {};
        this.setRuntimeState(data?.[1]);
        this.resultsBody.appendChild(E('tr', {}, E('td', { 'colspan': 10, 'class': 'owz-loading-cell' }, _('Loading strategies…'))));
        if (job?.job_id) {
            this.activeJob = job.job_id;
            this.testing = !this.isTerminal(job.status);
            this.showJob(job);
        }
        this.updateButtons();
        this.lastIdleRefresh = Date.now();

        // Загрузка профилей и Updates не блокирует первый render; запросы идут по очереди.
        this.loadProfiles().then(() => {
            flowsealStatus().then(status => {
                this.updateFlowsealInfo(status);
                if (!this.testing) this.checkFlowseal(true);
            }).catch(() => {
                this.updateFlowsealInfo({ ok: false, error: 'unavailable' });
                if (!this.testing) this.checkFlowseal(true);
            });
        });

        poll.add(L.bind(this.refreshJob, this), 2);
        return page;
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
