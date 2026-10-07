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
assert '--lua-desync=fake:blob=fs_tls_clienthello_www_google_com:tls_mod=none:repeats=6:tcp_ts=-600000' in p['nfqws2']
assert '--lua-desync=fakedsplit:pattern=0x00:tcp_ts=-600000' in p['nfqws2']
# nfqws1 allows repeated fake payloads; nfqws2 translation must preserve them
# as separate fake instances rather than repeated blob= parameters in one instance.
assert ':blob=fs_stun:blob=' not in p['nfqws2']
assert p['nfqws2'].count('--lua-desync=fake:blob=fs_stun:tls_mod=none:repeats=6:tcp_ts=-600000') >= 2

with tempfile.TemporaryDirectory(dir=HERE) as td:
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

    def convert(name: str, options: str) -> dict:
        # Строки повторяют реальные варианты general*.bat из Flowseal 1.10.3.
        source = td / f'general ({name}).bat'
        source.write_text(
            '@echo off\nstart "zapret: %~n0" /min "%BIN%winws.exe" '
            '--wf-tcp=443 --filter-tcp=443 ' + options + '\n', encoding='utf-8'
        )
        return mod.convert_file(source, '1.10.3', 'none')

    tls = convert('TLS', '--dpi-desync=fake --dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com')
    assert tls['compatible'] and 'tls_mod=rnd,dupsid,sni=www.google.com' in tls['nfqws2']
    assert 'blob=fake_default_tls' in tls['nfqws2']

    host = convert('HOST', '--dpi-desync=hostfakesplit --dpi-desync-hostfakesplit-mod=host=www.google.com')
    assert host['compatible'] and '--lua-desync=hostfakesplit:host=www.google.com' in host['nfqws2']
    altorder = convert('ALTORDER', '--dpi-desync=hostfakesplit --dpi-desync-hostfakesplit-mod=host=ya.ru,altorder=1')
    assert not altorder['compatible'] and any('altorder=1' in x for x in altorder['import']['unsupported'])

    badseq = convert('BADSEQ', '--dpi-desync=fake --dpi-desync-fooling=badseq --dpi-desync-badseq-increment=10000000')
    assert badseq['compatible'] and 'tcp_seq=10000000' in badseq['nfqws2']
    l3 = convert('L3', '--filter-l3=ipv4 --dpi-desync=syndata,multidisorder --dpi-desync-split-pos=1')
    assert l3['compatible'] and '--filter-l3=ipv4' in l3['nfqws2']
    assert '--payload=empty --lua-desync=syndata' in l3['nfqws2']
    domains = convert('DOMAINS', '--hostlist-exclude-domains=fonts.googleapis.com --dpi-desync=syndata')
    assert domains['compatible'] and '--hostlist-exclude-domains=fonts.googleapis.com' in domains['nfqws2']

    inline = convert('INLINE', '--dpi-desync=fake --dpi-desync-fake-tls=0x00000000 --dpi-desync-fake-tls=^! --dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com')
    assert inline['compatible'], inline['import']['unsupported']
    assert 'blob=0x00000000:tls_mod=none' in inline['nfqws2']
    assert 'blob=fake_default_tls:tls_mod=rnd,dupsid,sni=www.google.com' in inline['nfqws2']
    assert inline['requirements']['blobs'] == []

    traversal = convert('TRAVERSAL', '--hostlist="%LISTS%../secret.txt" --dpi-desync=syndata')
    assert not traversal['compatible'] and any('unsafe translated path' in x for x in traversal['import']['unsupported'])

    unknown = convert('UNKNOWN', '--dpi-desync=syndata --dpi-desync-mystery=1')
    assert not unknown['compatible'] and any('unsupported option:dpi-desync-mystery' == x for x in unknown['import']['unsupported'])

    operator = convert('OPERATOR', '--dpi-desync=syndata --hostlist-domains=good.com&evil')
    assert not operator['compatible'] and any('unsafe option value' in x for x in operator['import']['unsupported'])

print('flowseal importer selftest: OK')
