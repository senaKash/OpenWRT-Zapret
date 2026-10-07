#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# Загружаем только локальные функции обновления; сетевой run_update не запускаем.
sed '/^case "${1:-}" in/,$d' "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-update" > "$work/functions"
. "$work/functions"

source_root="$work/source"
asset_stage="$work/assets"
runtime_base='/etc/openwrtzapret/flowseal/assets/test'
mkdir -p "$source_root/lists" "$asset_stage"
FLOWSEAL_TOTAL=0

for name in list-general-user.txt list-exclude-user.txt ipset-exclude-user.txt; do
	copy_requirement "$runtime_base/lists/$name" "$runtime_base" "$source_root" "$asset_stage"
	[ -f "$asset_stage/lists/$name" ]
done
[ ! -s "$asset_stage/lists/list-general-user.txt" ]
[ "$(cat "$asset_stage/lists/list-exclude-user.txt")" = 'domain.example.abc' ]
[ "$(cat "$asset_stage/lists/ipset-exclude-user.txt")" = '203.0.113.113/32' ]

# Любой другой отсутствующий asset остаётся обязательным.
if copy_requirement "$runtime_base/lists/list-google.txt" "$runtime_base" "$source_root" "$asset_stage"; then exit 1; fi
if copy_requirement "$runtime_base/bin/missing.bin" "$runtime_base" "$source_root" "$asset_stage"; then exit 1; fi
if copy_requirement "$runtime_base/lists/../escape.txt" "$runtime_base" "$source_root" "$asset_stage"; then exit 1; fi

awk -v runtime_base="$runtime_base" -v game_tcp=12 -v game_udp=12 -v game_mode=none \
	-v profile_id=test -v profile_name=test -v source_version=test -v original_file='general (ALT).bat' \
	-v strategy_key=alt -v canon_file="$work/canon" -v strategy_file="$work/strategy" \
	-v out_file="$work/profile.json" -f "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-import.awk" \
	"$root/tests/fixtures/flowseal/general (ALT).bat"
grep -q '"compatible": true' "$work/profile.json"
grep -q -- '--lua-desync=fake:blob=fs_tls_clienthello_www_google_com:tls_mod=none' "$work/profile.json"

check_awk() {
	name=$1 options=$2 expected_compatible=$3 expected_text=$4
	printf '%s\n' '@echo off' "start \"fixture\" /min \"%BIN%winws.exe\" --wf-tcp=443 --filter-tcp=443 $options" > "$work/general ($name).bat"
	awk -v runtime_base="$runtime_base" -v game_tcp=12 -v game_udp=12 -v game_mode=none \
		-v profile_id=test -v profile_name=test -v source_version=test -v original_file="general ($name).bat" \
		-v strategy_key=test -v canon_file="$work/canon-$name" -v strategy_file="$work/strategy-$name" \
		-v out_file="$work/profile-$name.json" -f "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-import.awk" \
		"$work/general ($name).bat"
	grep -Fq "\"compatible\": $expected_compatible" "$work/profile-$name.json"
	grep -Fq -- "$expected_text" "$work/profile-$name.json"
}

# Примеры основаны на реальных строках general*.bat релиза 1.10.3.
check_awk tls '--dpi-desync=fake --dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com' true 'tls_mod=rnd,dupsid,sni=www.google.com'
check_awk host '--dpi-desync=hostfakesplit --dpi-desync-hostfakesplit-mod=host=www.google.com' true '--lua-desync=hostfakesplit:host=www.google.com'
check_awk altorder '--dpi-desync=hostfakesplit --dpi-desync-hostfakesplit-mod=host=ya.ru,altorder=1' false 'altorder=1 has no equivalent'
check_awk badseq '--dpi-desync=fake --dpi-desync-fooling=badseq --dpi-desync-badseq-increment=10000000' true 'tcp_seq=10000000'
check_awk l3 '--filter-l3=ipv4 --dpi-desync=syndata,multidisorder --dpi-desync-split-pos=1' true '--filter-l3=ipv4'
check_awk syndata '--dpi-desync=syndata' true '--payload=empty --lua-desync=syndata'
check_awk domains '--hostlist-exclude-domains=fonts.googleapis.com --dpi-desync=syndata' true '--hostlist-exclude-domains=fonts.googleapis.com'
check_awk inline '--dpi-desync=fake --dpi-desync-fake-tls=0x00000000 --dpi-desync-fake-tls=^! --dpi-desync-fake-tls-mod=rnd,dupsid,sni=www.google.com' true 'blob=fake_default_tls:tls_mod=rnd,dupsid,sni=www.google.com'
check_awk traversal '--hostlist=%LISTS%../secret.txt --dpi-desync=syndata' false 'unsafe translated path:'
check_awk unknown '--dpi-desync=syndata --dpi-desync-mystery=1' false 'unsupported option:dpi-desync-mystery'
check_awk operator '--dpi-desync=syndata --hostlist-domains=good.com&evil' false 'unsafe option value:hostlist-domains'

if [ "$#" -eq 1 ]; then
	# При наличии официального архива проверяем всю цепочку AWK -> assets -> JSON.
	release_dir=$1
	[ -d "$release_dir/bin" ] && [ -d "$release_dir/lists" ]
	profiles="$work/profiles"
	mkdir -p "$profiles"
	FLOWSEAL_TOTAL=0
	count=0
	compatible=0
	for bat in "$release_dir"/general*.bat; do
		[ -f "$bat" ] || continue
		count=$((count + 1))
		name=${bat##*/}
		canon="$work/canon-$count"
		out="$profiles/$count.json"
		strategy="$work/strategy-$count"
		awk -v runtime_base="$runtime_base" -v game_tcp=12 -v game_udp=12 -v game_mode=none \
			-v profile_id="test-$count" -v profile_name="$name" -v source_version=test \
			-v original_file="$name" -v strategy_key="$count" -v canon_file="$canon" \
			-v strategy_file="$strategy" -v out_file="$out" \
			-f "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-import.awk" "$bat"
		rc=0
		copy_requirements_from_canon "$canon" "$runtime_base" "$release_dir" "$asset_stage" || rc=$?
		if [ "$rc" -eq 10 ]; then
			awk -v runtime_base="$runtime_base" -v game_tcp=12 -v game_udp=12 -v game_mode=none \
				-v pre_unsupported="$FLOWSEAL_MISSING" -v profile_id="test-$count" -v profile_name="$name" \
				-v source_version=test -v original_file="$name" -v strategy_key="$count" \
				-v canon_file="$canon" -v strategy_file="$strategy" -v out_file="$out" \
				-f "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-import.awk" "$bat"
		elif [ "$rc" -ne 0 ]; then
			exit 1
		fi
		if grep -q '"compatible": true' "$out"; then
			compatible=$((compatible + 1))
		else
			printf '%s: %s\n' "$name" "$(sed -n 's/.*"unsupported": \(.*\)/\1/p' "$out")"
		fi
	done
	printf 'Flowseal release: detected=%s compatible=%s incompatible=%s\n' "$count" "$compatible" "$((count - compatible))"
fi

printf '%s\n' 'flowseal router importer fixtures: OK'
