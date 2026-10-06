#!/usr/bin/env python3
import json
import sys
import tempfile
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

HERE = Path(__file__).resolve().parent
spec = spec_from_file_location('flowseal_importer', HERE / 'import_flowseal.py')
assert spec and spec.loader
mod = module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

fixture = HERE / 'fixtures/general (ALT).bat'
p = mod.convert_file(fixture, 'fixture-2026.10', 'none')
assert p['compatible'] is True, p['import']
assert p['id'] == 'flowseal-fixture-2026-10-general-alt'
assert p['tcp_ports'] == '80,443,2053,2083,2087,2096,8443'
assert p['udp_ports'] == '443,19294-19344,50000-50100'
assert p['content_hash'].startswith('sha256:')
assert p['import']['unsupported'] == []
assert 'Flowseal GameFilter-only branches omitted' in p['import']['warnings']
assert '/etc/openwrtzapret/flowseal/assets/fixture-2026.10/' in p['nfqws2']
assert '--filter-tcp=12' not in p['nfqws2']
assert '--filter-udp=12' not in p['nfqws2']
assert '--payload=discord_ip_discovery --lua-desync=fake:blob=fs_active_discord_udp:repeats=6' in p['nfqws2']
assert '--payload=stun --lua-desync=fake:blob=fs_active_discord_udp:repeats=6' in p['nfqws2']
assert '--lua-desync=fake:blob=fs_tls_clienthello_www_google_com:repeats=6:tcp_ts=-600000' in p['nfqws2']
assert '--lua-desync=fakedsplit:pattern=0x00:tcp_ts=-600000' in p['nfqws2']
# nfqws1 allows repeated fake payloads; nfqws2 translation must preserve them
# as separate fake instances rather than repeated blob= parameters in one instance.
assert ':blob=fs_stun:blob=' not in p['nfqws2']
assert p['nfqws2'].count('--lua-desync=fake:blob=fs_stun:repeats=6:tcp_ts=-600000') >= 2

with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    bad = td / 'general (BAD).bat'
    bad.write_text(
        '@echo off\nstart "x" /min "%BIN%winws.exe" '
        '--wf-tcp=443 --filter-tcp=443 --definitely-unknown=1 '
        '--dpi-desync=fake --dpi-desync-fake-tls="%BIN%tls.bin"\n',
        encoding='utf-8'
    )
    q = mod.convert_file(bad, 'x1', 'none')
    assert q['compatible'] is False
    assert any('definitely-unknown' in x for x in q['import']['unsupported'])

    unresolved = td / 'general (UNRESOLVED).bat'
    unresolved.write_text(
        '@echo off\nstart "x" /min "%BIN%winws.exe" '
        '--wf-tcp=443 --filter-tcp=443 --hostlist="%EVIL%\\x.txt" '
        '--dpi-desync=fake --dpi-desync-fake-tls="%BIN%tls.bin"\n',
        encoding='utf-8'
    )
    r = mod.convert_file(unresolved, 'x2', 'none')
    assert r['compatible'] is False
    assert any('unresolved variable' in x for x in r['import']['unsupported'])

print('flowseal importer selftest: OK')
