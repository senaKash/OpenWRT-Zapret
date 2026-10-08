'use strict';
'require poll';
'require rpc';
'require ui';
'require view';

const getStatus = rpc.declare({ object: 'openwrtzapret', method: 'status', expect: { '': {} }, reject: true });
const getActiveProfile = rpc.declare({ object: 'openwrtzapret', method: 'profile_active', expect: { '': {} }, reject: true });
const start = rpc.declare({ object: 'openwrtzapret', method: 'start', expect: { '': {} }, reject: true });
const stop = rpc.declare({ object: 'openwrtzapret', method: 'stop', expect: { '': {} }, reject: true });
const restart = rpc.declare({ object: 'openwrtzapret', method: 'restart', expect: { '': {} }, reject: true });

const ASCII_TITLE = String.raw`  /$$$$$$                                /$$      /$$ /$$$$$$$  /$$$$$$$$   /$$$$$$$$                                           /$$    
 /$$__  $$                              | $$  /$ | $$| $$__  $$|__  $$__/  |_____ $$                                           | $$    
| $$  \ $$  /$$$$$$   /$$$$$$  /$$$$$$$ | $$ /$$$| $$| $$  \ $$   | $$          /$$/   /$$$$$$   /$$$$$$   /$$$$$$   /$$$$$$  /$$$$$$  
| $$  | $$ /$$__  $$ /$$__  $$| $$__  $$| $$/$$ $$ $$| $$$$$$$/   | $$ /$$$$$$ /$$/   |____  $$ /$$__  $$ /$$__  $$ /$$__  $$|_  $$_/  
| $$  | $$| $$  \ $$| $$$$$$$$| $$  \ $$| $$$$_  $$$$| $$__  $$   | $$|______//$$/     /$$$$$$$| $$  \ $$| $$  \__/| $$$$$$$$  | $$    
| $$  | $$| $$  | $$| $$_____/| $$  | $$| $$$/ \  $$$| $$  \ $$   | $$       /$$/     /$$__  $$| $$  | $$| $$      | $$_____/  | $$ /$$
|  $$$$$$/| $$$$$$$/|  $$$$$$$| $$  | $$| $$/   \  $$| $$  | $$   | $$      /$$$$$$$$|  $$$$$$$| $$$$$$$/| $$      |  $$$$$$$  |  $$$$/
 \______/ | $$____/  \_______/|__/  |__/|__/     \__/|__/  |__/   |__/     |________/ \_______/| $$____/ |__/       \_______/   \___/  
          | $$                                                                                 | $$                                    
          | $$                                                                                 | $$                                    
          |__/                                                                                 |__/                                    `;


/* Local decorative ASCII art; does not use any service RPC. */
function createEyeController(eye, page) {
    const W = 62, H = 29, cx = 30.5, cy = 13.7;
    const cache = new Map(), maxCache = 45;
    const f = (x, y) => {
        let v = ((x * 19441 + y * 30971 + x * y * 913) ^ ((x + 23) * 7117)) >>> 0;
        v ^= v >>> 13;
        v = Math.imul(v, 1274126177);
        return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
    };
    const make = (dx, dy) => {
        let out = '';
        for (let y = 0; y < H; y++) {
            let last = '', chunk = '';
            const flush = () => {
                if (chunk) {
                    out += last === ' ' ? chunk : '<span class="' + last + '">' + chunk + '</span>';
                    chunk = '';
                }
            };
            for (let x = 0; x < W; x++) {
                const a = x - cx, b = y - cy, ax = Math.abs(a);
                const n = f(x, y), r = Math.hypot(a / 23.7, b / 11.3), ring = Math.abs(r - 1) < .085;
                const eyeW = 23.9, edgeY = 8.4 * Math.pow(Math.max(0, 1 - (a / eyeW) ** 2), .8);
                const inside = ax < eyeW && Math.abs(b) < edgeY;
                const border = inside && Math.abs(Math.abs(b) - edgeY) < .75;
                const iris = Math.pow((a - .3 - dx) / 7.3, 2) + Math.pow((b - dy) / 6.1, 2) < 1;
                const pupil = Math.pow((a - .3 - dx) / 4.5, 2) + Math.pow((b - dy) / 4.3, 2) < 1;
                const halo = Math.pow(a / 28.2, 2) + Math.pow(b / 12.7, 2) < 1.1;
                let ch = ' ', cl = ' ';
                if (halo) {
                    if (n < .42) { ch = n < .17 ? '.' : n < .3 ? ':' : '+'; cl = 'd'; }
                }
                else if (n < .012 && x > 4 && x < 58 && y > 3 && y < 27) {
                    ch = '.'; cl = 'm';
                }
                if (inside) {
                    if (pupil) {
                        if (n < .17) { ch = '.'; cl = 'd'; }
                        else { ch = ' '; cl = ' '; }
                    }
                    else if (iris) { ch = n < .22 ? 'x' : n < .53 ? '+' : n < .76 ? ':' : '#'; cl = 'w'; }
                    else { ch = n < .18 ? ':' : n < .4 ? '+' : n < .73 ? 'x' : '#'; cl = 'w'; }
                }
                if (border) { ch = n < .3 ? '+' : 'x'; cl = 'w'; }
                if (ring) { ch = n < .18 ? '+' : '*'; cl = 'p'; }
                if ((x === 7 || x === 54) && (y === 23 || y === 5)) { ch = '+'; cl = 'p'; }
                if (last !== cl) { flush(); last = cl; }
                chunk += ch;
            }
            flush();
            out += '\n';
        }
        return out;
    };
    const renderEye = (x, y) => {
        const key = x + ',' + y;
        if (!cache.has(key)) {
            if (cache.size >= maxCache) cache.delete(cache.keys().next().value);
            cache.set(key, make(x, y));
        }
        eye.innerHTML = cache.get(key); // HTML generated solely from fixed ASCII characters and span class names.
    };

    renderEye(0, 0);
    let pending = false, targetX = 0, targetY = 0, current = '0,0';
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const abort = new AbortController();
    const update = () => {
        pending = false;
        if (!page.isConnected || reducedMotion.matches) return;
        const key = targetX + ',' + targetY;
        if (key !== current) { current = key; renderEye(targetX, targetY); }
        eye.style.transform = `translate(${targetX * .55}px, ${targetY * .65}px)`;
    };
    const schedule = () => {
        if (!pending) { pending = true; requestAnimationFrame(update); }
    };
    document.addEventListener('pointermove', (ev) => {
        if (ev.pointerType === 'touch' || reducedMotion.matches) return;
        const rect = eye.getBoundingClientRect();
        const ex = rect.left + rect.width / 2, ey = rect.top + rect.height / 2;
        const nx = clamp((ev.clientX - ex) / Math.max(175, window.innerWidth * .23), -1, 1);
        const ny = clamp((ev.clientY - ey) / Math.max(150, window.innerHeight * .32), -1, 1);
        targetX = Math.round(nx * 10);
        targetY = Math.round(ny * 3);
        schedule();
    }, { passive: true, signal: abort.signal });
    document.addEventListener('mouseout', (ev) => {
        if (ev.relatedTarget || reducedMotion.matches) return;
        targetX = targetY = 0;
        schedule();
    }, { passive: true, signal: abort.signal });

    /* LuCI swaps the contents of #view during navigation. Unregister document listeners
       when the page is detached, instead of letting old instances accumulate. */
    const host = document.getElementById('view') || page.parentNode;
    if (host) {
        const observer = new MutationObserver(() => {
            if (!page.isConnected) {
                abort.abort();
                observer.disconnect();
                cache.clear();
            }
        });
        observer.observe(host, { childList: true });
    }
}

return view.extend({
    busy: false,
    status: null,
    currentState: 'ERROR',

    load: function() {
        return Promise.all([getStatus(), getActiveProfile().catch(() => null)]);
    },

    showStatus: function(value, profile) {
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
        this.fields.profile.textContent = profile?.ok === true
            ? (profile.profile || _('Manual configuration')) : _('Unknown');
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
            let [status, profile] = await Promise.all([getStatus(), getActiveProfile().catch(() => null)]);
            this.showStatus(status, profile);
        } catch (e) {
            this.showStatus({ error: 'status_rpc_failed' }, null);
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
        try {
            let [status, profile] = await Promise.all([getStatus(), getActiveProfile().catch(() => null)]);
            this.showStatus(status, profile);
        }
        catch (e) { this.showStatus({ error: 'status_rpc_failed' }, null); }
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
        const eyeArt = E('pre', { 'class': 'owz-eye-art', 'aria-hidden': 'true' });
        let page = E('div', { 'class': 'owz-dashboard owz-theme' }, [
            E('link', { 'rel': 'stylesheet', 'href': L.resource('view/zapret2/dashboard.css') + '?v=2' }),
            E('link', { 'rel': 'stylesheet', 'href': L.resource('view/zapret2/theme.css') + '?v=1' }),
            E('h2', { 'class': 'owz-screenreader' }, _('OpenWRTZapret')),
            E('pre', { 'class': 'owz-ascii-title', 'aria-hidden': 'true' }, ASCII_TITLE),
            E('div', { 'class': 'owz-dashboard-layout' }, [
                E('div', { 'class': 'owz-dashboard-status' }, [
                    E('div', { 'class': 'cbi-section' }, [
                        E('h3', _('Service status')),
                        field(_('State'), 'state'),
                        field(_('Daemon'), 'daemon'),
                        field(_('Firewall'), 'firewall'),
                        field(_('NFQUEUE rules'), 'nfqueue'),
                        field(_('Autostart'), 'enabled'),
                        field(_('Active profile'), 'profile'),
                        field(_('Error'), 'error')
                    ]),
                    E('div', { 'class': 'cbi-section owz-dashboard-actions' }, [
                        this.buttons.start, this.buttons.stop, this.buttons.restart
                    ])
                ]),
                E('div', {
                    'class': 'owz-eye-panel',
                    'aria-label': _('Decorative ASCII eye following the cursor')
                }, [
                    eyeArt
                ])
            ])
        ]);
        // The render() node is attached by LuCI after return; defer listener setup one frame.
        requestAnimationFrame(() => {
            if (page.isConnected) createEyeController(eyeArt, page);
        });
        this.showStatus(data?.[0], data?.[1]);
        poll.add(L.bind(this.refresh, this), 5);
        return page;
    },

    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
