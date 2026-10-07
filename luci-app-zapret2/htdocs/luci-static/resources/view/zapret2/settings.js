'use strict';
'require rpc';
'require ui';
'require view';

const listsStatus = rpc.declare({ object: 'openwrtzapret', method: 'lists_status', expect: { '': {} }, reject: true });
const putList = rpc.declare({ object: 'openwrtzapret', method: 'put_list', params: [ 'name', 'data' ], expect: { '': {} }, reject: true });
const removeList = rpc.declare({ object: 'openwrtzapret', method: 'remove_list', params: [ 'name' ], expect: { '': {} }, reject: true });
const resetLists = rpc.declare({ object: 'openwrtzapret', method: 'reset_lists', expect: { '': {} }, reject: true });

document.head.appendChild(E('link', {
    rel: 'stylesheet', href: L.resource('view/zapret2/strategies.css') + '?v=26'
}));

function encodeBase64(buffer) {
    let bytes = new Uint8Array(buffer), binary = '';
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
        this.fileInput.disabled = this.busy || !this.available;
        this.resetButton.disabled = this.busy || !this.lists.some(item => item.source == 'custom');
    },

    renderRows: function() {
        this.rows.replaceChildren();
        this.lists.forEach(item => {
            let source = item.source || 'missing';
            let remove = E('button', {
                'class': 'btn cbi-button-negative',
                'disabled': this.busy || source != 'custom',
                'click': L.bind(this.removeOverride, this, item.name)
            }, _('Remove'));
            this.rows.appendChild(E('tr', {}, [
                E('td', {}, item.name),
                E('td', {}, item.target),
                E('td', {}, E('span', {
                    'class': 'owz-badge owz-badge-' + (source == 'custom' ? 'testing' : source == 'builtin' ? 'neutral' : 'fail')
                }, source)),
                E('td', { 'class': 'owz-action-cell' }, remove)
            ]));
        });
        this.updateButtons();
    },

    handleFiles: async function(files) {
        if (this.busy || !this.available || !files?.length) return;
        this.busy = true;
        this.renderRows();
        try {
            for (let file of Array.from(files)) {
                if (!/\.txt$/i.test(file.name) || file.size > 49152) {
                    this.notify(_('Only .txt files up to 48 KiB are accepted: %s').format(file.name));
                    continue;
                }
                let item = this.lists.find(entry => entry.name == file.name);
                if (!item) {
                    this.notify(_('Unknown list file: %s').format(file.name));
                    continue;
                }
                try {
                    let result = await putList(item.name, encodeBase64(await file.arrayBuffer()));
                    if (!result?.ok) throw new Error(result?.error || 'invalid_backend_response');
                    item.source = result.source;
                    this.notify(_('List updated: %s').format(item.name));
                }
                catch (e) {
                    this.notify(_('Unable to update %s: %s').format(item.name, e.message || e));
                }
            }
        }
        finally {
            this.busy = false;
            this.fileInput.value = '';
            this.renderRows();
        }
    },

    dropFiles: function(ev) {
        ev.preventDefault();
        this.dropzone.classList.remove('owz-list-drop-active');
        this.handleFiles(ev.dataTransfer?.files);
    },

    removeOverride: async function(name) {
        if (this.busy || !this.available) return;
        this.busy = true;
        this.renderRows();
        try {
            let result = await removeList(name);
            if (!result?.ok) throw new Error(result?.error || 'invalid_backend_response');
            let item = this.lists.find(entry => entry.name == name);
            if (item) item.source = result.source;
        }
        catch (e) {
            this.notify(_('Unable to remove override: %s').format(e.message || e));
        }
        finally {
            this.busy = false;
            this.renderRows();
        }
    },

    resetAll: async function() {
        if (this.busy || !this.available || !window.confirm(_('Remove all custom list overrides?'))) return;
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
        this.fileInput = E('input', {
            'type': 'file', 'accept': '.txt', 'multiple': true,
            'change': ev => this.handleFiles(ev.target.files)
        });
        this.dropzone = E('div', {
            'class': 'owz-list-drop',
            'dragover': ev => { ev.preventDefault(); this.dropzone.classList.add('owz-list-drop-active'); },
            'dragleave': () => this.dropzone.classList.remove('owz-list-drop-active'),
            'drop': L.bind(this.dropFiles, this)
        }, [
            E('span', {}, _('Drop .txt list files here or choose files:')),
            this.fileInput
        ]);
        this.resetButton = E('button', {
            'class': 'btn cbi-button-negative', 'click': L.bind(this.resetAll, this)
        }, _('Reset All'));
        this.rows = E('tbody');
        this.renderRows();

        return E('div', [
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'owz-section-heading owz-lists-heading' }, [
                    E('h2', _('Lists')), this.resetButton
                ]),
                E('p', { 'class': 'cbi-value-description' }, _('A custom list replaces its built-in version. Remove restores the built-in file.')),
                ...(this.available ? [] : [ E('p', { 'class': 'cbi-value-description' }, _('Unable to load lists: %s').format(data?.error || 'unknown_error')) ]),
                this.dropzone,
                E('p', { 'class': 'cbi-value-description' }, _('Use one of the file names shown below. Restart Zapret2 to ensure changes take effect.'))
            ]),
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'owz-results-wrap' }, E('table', { 'class': 'table owz-results-table owz-lists-table' }, [
                    E('colgroup', {}, [ E('col'), E('col'), E('col'), E('col') ]),
                    E('thead', {}, E('tr', {}, [
                        E('th', {}, _('List')), E('th', {}, _('Zapret2 file')), E('th', {}, _('Source')), E('th', { 'class': 'owz-action-cell' }, _('Action'))
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
