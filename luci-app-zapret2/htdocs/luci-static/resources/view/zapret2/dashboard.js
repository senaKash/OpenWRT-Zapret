'use strict';
'require poll';
'require rpc';
'require ui';
'require view';

const getStatus = rpc.declare({ object: 'openwrtzapret', method: 'status', expect: { '': {} }, reject: true });
const start = rpc.declare({ object: 'openwrtzapret', method: 'start', expect: { '': {} }, reject: true });
const stop = rpc.declare({ object: 'openwrtzapret', method: 'stop', expect: { '': {} }, reject: true });
const restart = rpc.declare({ object: 'openwrtzapret', method: 'restart', expect: { '': {} }, reject: true });

return view.extend({
    busy: false,
    status: null,
    currentState: 'ERROR',

    load: function() {
        return getStatus();
    },

    showStatus: function(value) {
        let valid = value && typeof value.running == 'boolean' &&
            typeof value.daemon == 'boolean' && typeof value.firewall == 'boolean' &&
            typeof value.nfqueue == 'boolean' && typeof value.partial == 'boolean';
        let state = 'ERROR';
        if (valid && !value.error) {
            if (value.daemon && value.firewall && value.nfqueue && value.running && !value.partial)
                state = 'RUNNING';
            else if (!value.daemon && !value.firewall && !value.nfqueue && !value.running && !value.partial)
                state = 'STOPPED';
            else
                state = 'PARTIAL';
        }
        this.status = valid ? value : null;
        this.currentState = state;
        this.fields.state.textContent = {
            RUNNING: '● ' + _('Running'),
            STOPPED: '● ' + _('Stopped'),
            PARTIAL: '⚠ ' + _('Partial'),
            ERROR: '✖ ' + _('Error')
        }[state];
        this.fields.daemon.textContent = valid ? (value.daemon ? _('Running') : _('Stopped')) : _('Unknown');
        this.fields.firewall.textContent = valid ? (value.firewall ? _('Active') : _('Inactive')) : _('Unknown');
        this.fields.nfqueue.textContent = valid ? (value.nfqueue ? _('Active') : _('Inactive')) : _('Unknown');
        this.fields.enabled.textContent = valid && typeof value.enabled == 'boolean'
            ? (value.enabled ? _('Enabled') : _('Disabled')) : _('Unknown');
        this.fields.error.textContent = value?.error ? String(value.error) : '';
        this.updateButtons();
    },

    updateButtons: function() {
        let state = this.currentState;
        this.buttons.start.disabled = this.busy || state == 'RUNNING' || state == 'ERROR';
        this.buttons.stop.disabled = this.busy || state == 'STOPPED' || state == 'ERROR';
        this.buttons.restart.disabled = this.busy || state == 'ERROR';
    },

    refresh: async function() {
        if (this.busy) return;
        try {
            this.showStatus(await getStatus());
        } catch (e) {
            this.showStatus({ error: 'status_rpc_failed' });
        }
    },

    act: async function(action) {
        if (this.busy || !['start', 'stop', 'restart'].includes(action)) return;
        this.busy = true;
        let button = this.buttons[action];
        let label = button.textContent;
        button.textContent = _('Working…');
        this.updateButtons();
        try {
            let result = await ({ start, stop, restart })[action]();
            if (result?.status) this.showStatus(result.status);
            if (!result?.ok) {
                let detail = [ result?.stage || 'unknown', result?.error || 'unknown_error' ].join(': ');
                if (result?.cleanup_attempted)
                    detail += result.cleanup_success ? ' (cleanup succeeded)' : ' (cleanup failed; inspect service state)';
                if (result?.final_state) detail += ' [' + result.final_state + ']';
                ui.addNotification(null, E('p', _('Service action failed: %s').format(detail)));
            }
            await this.refreshAfterAction();
        } catch (e) {
            ui.addNotification(null, E('p', _('Service action failed: %s').format(e.message || e)));
            await this.refreshAfterAction();
        } finally {
            this.busy = false;
            button.textContent = label;
            this.updateButtons();
        }
    },

    refreshAfterAction: async function() {
        try { this.showStatus(await getStatus()); }
        catch (e) { this.showStatus({ error: 'status_rpc_failed' }); }
    },

    render: function(data) {
        let field = (label, key) => E('div', { 'class': 'cbi-value' }, [
            E('label', { 'class': 'cbi-value-title' }, label),
            E('div', { 'class': 'cbi-value-field' }, this.fields[key] = E('span'))
        ]);
        this.fields = { };
        this.buttons = {
            start: E('button', { 'class': 'btn cbi-button-action', 'click': L.bind(this.act, this, 'start') }, _('Start')),
            stop: E('button', { 'class': 'btn cbi-button-negative', 'click': L.bind(this.act, this, 'stop') }, _('Stop')),
            restart: E('button', { 'class': 'btn cbi-button-action', 'click': L.bind(this.act, this, 'restart') }, _('Restart'))
        };
        let page = E('div', [
            E('h2', _('OpenWRTZapret')),
            E('div', { 'class': 'cbi-section' }, [
                E('h3', _('Service status')),
                field(_('State'), 'state'),
                field(_('Daemon'), 'daemon'),
                field(_('Firewall'), 'firewall'),
                field(_('NFQUEUE rules'), 'nfqueue'),
                field(_('Autostart'), 'enabled'),
                field(_('Error'), 'error')
            ]),
            E('div', { 'class': 'cbi-section', 'style': 'display:flex; flex-wrap:wrap; gap:.5rem' }, [
                this.buttons.start, this.buttons.stop, this.buttons.restart
            ])
        ]);
        this.showStatus(data);
        poll.add(L.bind(this.refresh, this), 5);
        return page;
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
