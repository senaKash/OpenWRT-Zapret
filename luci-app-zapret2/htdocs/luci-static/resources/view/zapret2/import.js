'use strict';
'require rpc';
'require ui';
'require view';

const importUserStrategy = rpc.declare({
    object: 'openwrtzapret', method: 'import_user_strategy', params: [ 'data' ], expect: { '': {} }, reject: true
});

function encodeUtf8Base64(value) {
    let bytes = new TextEncoder().encode(value), binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

return view.extend({
    busy: false,

    addStrategy: async function() {
        if (this.busy) return;
        let text = this.input.value || '';
        if (!text.trim()) {
            ui.addNotification(null, E('p', _('Paste a Flowseal strategy first.')));
            return;
        }
        if (new TextEncoder().encode(text).length > 32768) {
            ui.addNotification(null, E('p', _('Strategy is too large. Maximum size is 32 KiB.')));
            return;
        }
        this.busy = true;
        this.addButton.disabled = true;
        try {
            let result = await importUserStrategy(encodeUtf8Base64(text));
            if (!result?.ok) {
                ui.addNotification(null, E('p', _('Unable to import strategy: %s').format(result?.error || 'unknown_error')));
                return;
            }
            ui.addNotification(null, E('p', _('Strategy added.')));
            window.location.href = L.url('admin/services/zapret2/strategies');
        }
        catch (e) {
            ui.addNotification(null, E('p', _('Unable to import strategy: %s').format(e.message || e)));
        }
        finally {
            this.busy = false;
            this.addButton.disabled = false;
        }
    },

    render: function() {
        this.input = E('textarea', {
            'class': 'cbi-input-textarea', 'rows': 16,
            'placeholder': _('Paste the contents of a Flowseal strategy BAT file here')
        });
        this.addButton = E('button', {
            'class': 'btn cbi-button-apply',
            'click': L.bind(this.addStrategy, this)
        }, _('Add'));
        return E('div', [
            E('h2', _('Import Strategy')),
            E('p', { 'class': 'cbi-value-description' }, _('The pasted BAT text is treated only as data and is never executed. It is converted by the existing Flowseal importer and validated by zapret2 before being saved.')),
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Strategy text')),
                    E('div', { 'class': 'cbi-value-field' }, this.input)
                ]),
                E('div', { 'class': 'cbi-page-actions' }, this.addButton)
            ])
        ]);
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
