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

    loadBatFile: async function() {
        let file = this.fileInput.files?.[0];
        if (!file) return;
        this.input.value = '';
        if (file.size > 32768) {
            ui.addNotification(null, E('p', _('Strategy is too large. Maximum size is 32 KiB.')));
            return;
        }
        this.busy = true;
        this.addButton.disabled = true;
        try {
            this.input.value = await file.text();
        }
        catch (e) {
            ui.addNotification(null, E('p', _('Unable to read BAT file: %s').format(e.message || e)));
        }
        finally {
            this.busy = false;
            this.addButton.disabled = false;
        }
    },

    addStrategy: async function() {
        if (this.busy) return;
        let text = this.input.value || '';
        if (!text.trim()) {
            ui.addNotification(null, E('p', _('Paste a zapret-discord-youtube strategy first.')));
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
        this.fileInput = E('input', {
            'type': 'file', 'accept': '.bat',
            'change': L.bind(this.loadBatFile, this)
        });
        this.input = E('textarea', {
            'class': 'cbi-input-textarea', 'rows': 16,
            'placeholder': _('Paste the contents of a zapret-discord-youtube strategy BAT file here')
        });
        this.addButton = E('button', {
            'class': 'btn cbi-button-apply',
            'click': L.bind(this.addStrategy, this)
        }, _('Add'));
        return E('div', { 'class': 'owz-theme owz-import-page' }, [
            E('link', { 'rel': 'stylesheet', 'href': L.resource('view/zapret2/theme.css') + '?v=1' }),
            E('link', { 'rel': 'stylesheet', 'href': L.resource('view/zapret2/terminal-art.css') + '?v=3' }),
            E('div', { 'class': 'owz-import-full-grid' }, [
                E('aside', { 'class': 'owz-import-art-rail', 'aria-hidden': 'true' }, [
                    E('pre', { 'class': 'owz-art owz-import-diskette' }, " .-----------------.\n |  .----------.  |\n |  | 3.5 BAT  |  |\n |  '----------'  |\n |   __________   |\n |  |__________|  |\n '-----------------'"),
                    E('pre', { 'class': 'owz-art owz-import-route' }, '         |\n         v\n  +-------------+\n  | BAT  INPUT  |\n  +------+------+\n         |\n         v\n  +-------------+\n  |   CONVERT   |\n  +------+------+\n         |\n         v\n  [ JSON PROFILE ]')
                ]),
                E('div', { 'class': 'owz-import-editor-area' }, [
            E('h2', _('Import Strategy')),
            E('p', { 'class': 'cbi-value-description' }, _('Choose a zapret-discord-youtube general*.bat file or paste its contents. Update Strategies must install the strategy assets first. BAT text is converted as data and never executed.')),
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('BAT file')),
                    E('div', { 'class': 'cbi-value-field' }, this.fileInput)
                ]),
                E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Strategy text')),
                    E('div', { 'class': 'cbi-value-field' }, this.input)
                ]),
                E('div', { 'class': 'cbi-page-actions' }, this.addButton)
            ]),
            E('div', { 'class': 'cbi-section owz-import-lists-note' }, [
                E('div', {}, [
                    E('strong', {}, _('Custom lists')),
                    E('div', { 'class': 'cbi-value-description' },
                        _('If this strategy relies on custom domain or IP lists, copy those entries on the Lists page after importing it.'))
                ]),
                E('a', {
                    'href': L.url('admin/services/zapret2/settings'),
                    'class': 'btn cbi-button'
                }, _('Open Lists'))
            ])
                ])
            ])
        ]);
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
