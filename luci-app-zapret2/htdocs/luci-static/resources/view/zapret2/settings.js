'use strict';
'require fs';
'require rpc';
'require ui';
'require view';

const listsStatus = rpc.declare({ object: 'openwrtzapret', method: 'lists_status', expect: { '': {} }, reject: true });
const putList = rpc.declare({ object: 'openwrtzapret', method: 'put_list', params: [ 'name', 'data' ], expect: { '': {} }, reject: true });
const removeList = rpc.declare({ object: 'openwrtzapret', method: 'remove_list', params: [ 'name' ], expect: { '': {} }, reject: true });
const resetLists = rpc.declare({ object: 'openwrtzapret', method: 'reset_lists', expect: { '': {} }, reject: true });

const MAX_LIST_BYTES = 49152;

document.head.appendChild(E('link', {
    rel: 'stylesheet', href: L.resource('view/zapret2/strategies.css') + '?v=27'
}));

function encodeTextBase64(text) {
    let bytes = new TextEncoder().encode(text), binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

return view.extend({
    busy: false,
    lists: [],
    available: false,

    load: function() {
        return listsStatus().catch(e => ({ ok: false, error: e.message || String(e) }));
    },

    notify: function(message) {
        ui.addNotification(null, E('p', message));
    },

    updateButtons: function() {
        this.resetButton.disabled = this.busy || !this.lists.some(item => item.source == 'custom');
    },

    renderRows: function() {
        this.rows.replaceChildren();
        this.lists.forEach(item => {
            let source = item.source || 'missing';
            let actions = E('div', { 'class': 'owz-list-actions' }, [
                E('button', {
                    'class': 'btn cbi-button owz-list-edit-button',
                    'disabled': this.busy || source == 'missing',
                    'click': L.bind(this.editList, this, item)
                }, _('Edit'))
            ]);

            if (source == 'custom') {
                actions.appendChild(E('button', {
                    'class': 'btn cbi-button-negative owz-list-reset-button',
                    'disabled': this.busy,
                    'click': L.bind(this.removeOverride, this, item.name)
                }, _('Reset')));
            }

            this.rows.appendChild(E('tr', {}, [
                E('td', { 'class': 'owz-list-name' }, item.name),
                E('td', {}, E('span', {
                    'class': 'owz-badge owz-badge-' + (source == 'custom' ? 'testing' : source == 'builtin' ? 'neutral' : 'fail')
                }, source == 'custom' ? _('Custom') : source == 'builtin' ? _('Built-in') : _('Missing'))),
                E('td', { 'class': 'owz-action-cell' }, actions)
            ]));
        });
        this.updateButtons();
    },

    editList: async function(item) {
        if (this.busy || !this.available || !item?.target) return;

        let content;
        try {
            content = await fs.read('/opt/zapret2/ipset/' + item.target);
        }
        catch (e) {
            this.notify(_('Unable to read %s: %s').format(item.name, e.message || e));
            return;
        }

        let textarea = E('textarea', {
            'class': 'cbi-input-textarea owz-list-editor',
            'spellcheck': 'false',
            'wrap': 'off'
        }, content || '');

        let cancel = E('button', {
            'class': 'btn',
            'click': ui.hideModal
        }, _('Cancel'));

        let save = E('button', {
            'class': 'btn cbi-button-positive important',
            'click': L.bind(async function() {
                if (this.busy) return;
                let text = textarea.value || '';
                let bytes = new TextEncoder().encode(text);
                if (bytes.length > MAX_LIST_BYTES) {
                    this.notify(_('List is too large. Maximum size is 48 KiB.'));
                    return;
                }

                this.busy = true;
                save.disabled = true;
                cancel.disabled = true;
                try {
                    let result = await putList(item.name, encodeTextBase64(text));
                    if (!result?.ok) throw new Error(result?.error || 'invalid_backend_response');
                    item.source = result.source || 'custom';
                    ui.hideModal();
                    this.renderRows();
                    this.notify(_('List saved: %s').format(item.name));
                }
                catch (e) {
                    this.notify(_('Unable to update %s: %s').format(item.name, e.message || e));
                }
                finally {
                    this.busy = false;
                    save.disabled = false;
                    cancel.disabled = false;
                    this.renderRows();
                }
            }, this)
        }, _('Save'));

        ui.showModal(_('Edit %s').format(item.name), [
            E('p', { 'class': 'cbi-value-description owz-list-editor-note' },
                _('Saving creates a custom override. Reset restores the built-in version.')),
            textarea,
            E('div', { 'class': 'right owz-list-editor-buttons' }, [ cancel, save ])
        ]);
        textarea.focus();
    },

    removeOverride: async function(name) {
        if (this.busy || !this.available || !window.confirm(_('Reset %s to the built-in version?').format(name))) return;
        this.busy = true;
        this.renderRows();
        try {
            let result = await removeList(name);
            if (!result?.ok) throw new Error(result?.error || 'invalid_backend_response');
            let item = this.lists.find(entry => entry.name == name);
            if (item) item.source = result.source || 'builtin';
        }
        catch (e) {
            this.notify(_('Unable to reset list: %s').format(e.message || e));
        }
        finally {
            this.busy = false;
            this.renderRows();
        }
    },

    resetAll: async function() {
        if (this.busy || !this.available || !window.confirm(_('Reset all custom lists to their built-in versions?'))) return;
        this.busy = true;
        this.renderRows();
        try {
            let result = await resetLists();
            if (!result?.ok) throw new Error(result?.error || 'invalid_backend_response');
            this.lists.forEach(item => { item.source = 'builtin'; });
        }
        catch (e) {
            this.notify(_('Unable to reset all lists: %s').format(e.message || e));
            let status = await listsStatus().catch(() => null);
            if (status?.ok) this.lists = status.lists || [];
        }
        finally {
            this.busy = false;
            this.renderRows();
        }
    },

    render: function(data) {
        this.available = !!data?.ok;
        this.lists = this.available ? data.lists || [] : [];
        this.resetButton = E('button', {
            'class': 'btn cbi-button-negative',
            'click': L.bind(this.resetAll, this)
        }, _('Reset All'));
        this.rows = E('tbody');
        this.renderRows();

        return E('div', [
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'owz-section-heading owz-lists-heading' }, [
                    E('h2', _('Lists')), this.resetButton
                ]),
                E('p', { 'class': 'cbi-value-description' },
                    _('Edit a list to create a custom override. Reset restores the built-in version. Restart Zapret2 to ensure changes take effect.')),
                ...(this.available ? [] : [ E('p', { 'class': 'cbi-value-description' }, _('Unable to load lists: %s').format(data?.error || 'unknown_error')) ])
            ]),
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'owz-results-wrap' }, E('table', { 'class': 'table owz-results-table owz-lists-table' }, [
                    E('colgroup', {}, [ E('col'), E('col'), E('col') ]),
                    E('thead', {}, E('tr', {}, [
                        E('th', {}, _('List')),
                        E('th', {}, _('Source')),
                        E('th', { 'class': 'owz-action-cell' }, _('Action'))
                    ])),
                    this.rows
                ]))
            ])
        ]);
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
