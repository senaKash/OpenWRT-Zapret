#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

sed '/^case "${1:-}" in/,$d' "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-update" > "$work/updater-functions"
. "$work/updater-functions"
# Локальный Windows runner может не содержать sha256sum; на роутере используется coreutils.
if ! command -v sha256sum >/dev/null 2>&1; then
    : "${OWZ_TEST_PYTHON:=python3}"
    sha256sum() {
        "$OWZ_TEST_PYTHON" -c 'import hashlib,sys; p=sys.argv[1]; print(hashlib.sha256(open(p,"rb").read()).hexdigest(), p)' "$1"
    }
fi
if ! command -v chmod >/dev/null 2>&1; then chmod() { :; }; fi
STATE_ROOT="$work/state"
ASSET_ROOT="$STATE_ROOT/assets"
RUNTIME_ASSET_ROOT="$ASSET_ROOT"
PROFILE_ROOT="$work/profiles/flowseal"
IMPORT_AWK="$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-import.awk"
version=X
runtime_base="$RUNTIME_ASSET_ROOT/$version"
source_root="$work/source"
jobdir="$work/job"
mkdir -p "$source_root" "$jobdir"

uci() { return 1; }
jsonfilter() {
    local file='' expr=''
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -i) file=$2; shift 2;;
            -e) expr=$2; shift 2;;
            *) shift;;
        esac
    done
    case "$expr" in
        '@.compatible') sed -n 's/.*"compatible": \(true\|false\).*/\1/p' "$file";;
        '@.source_version') sed -n 's/.*"source_version": "\([^"]*\)".*/\1/p' "$file";;
        *) return 1;;
    esac
}

prepare_source() {
    local bat="$1" canon="$2" out="$3" strategy="$4" key csv req rel oldifs
    awk -v runtime_base="$runtime_base" -v game_tcp=12 -v game_udp=12 -v game_mode=none \
        -v profile_id=flowseal-x-general-alt12 -v profile_name='general (ALT12)' -v source_version="$version" \
        -v original_file='general (ALT12).bat' -v strategy_key=general-alt12 \
        -v canon_file="$canon" -v strategy_file="$strategy" -v out_file="$out" \
        -f "$IMPORT_AWK" "$bat"
    for key in requirements.blobs requirements.hostlists requirements.ipsets; do
        csv=$(sed -n "s/^${key}=//p" "$canon" | tail -n 1)
        [ -n "$csv" ] || continue
        oldifs=$IFS; IFS=,; set -- $csv; IFS=$oldifs
        for req in "$@"; do
            rel=${req#"$runtime_base"/}
            case "$rel" in
                lists/list-general-user.txt|lists/list-exclude-user.txt|lists/ipset-exclude-user.txt) continue;;
            esac
            mkdir -p "$source_root/${rel%/*}"
            printf 'fixture %s\n' "$rel" > "$source_root/$rel"
        done
    done
}

first="$root/tests/fixtures/flowseal/general (ALT12).bat"
prepare_source "$first" "$work/canon-1" "$work/profile-1.json" "$work/strategy-1"
mkdir -p "$work/stage-1/profiles" "$work/stage-1/assets"
: > "$work/stage-1/manifest.tsv"
FLOWSEAL_TOTAL=0
import_one "$first" "$version" "$source_root" "$work/stage-1/profiles" "$work/stage-1/assets" "$work/stage-1/manifest.tsv"
grep -q '"compatible": true' "$work/stage-1/profiles/flowseal-x-general-alt12.json"
printf '%s\n' '{"ok":true}' > "$work/report.json"
install_staged "$version" "$work/stage-1/profiles" "$work/stage-1/assets" "$work/stage-1/manifest.tsv" "$work/report.json" "$jobdir" deadbeef
old_asset="$ASSET_ROOT/$version/bin/quic_initial_www_google_com.bin"
[ -f "$old_asset" ]

# Повторный импорт той же версии создаёт новый requirement из изменённого BAT.
mkdir -p "$work/second"
second="$work/second/general (ALT12).bat"
sed 's/quic_initial_www_google_com\.bin/quic_initial_www_google_com_v2.bin/g' "$first" > "$second"
prepare_source "$second" "$work/canon-2" "$work/profile-2.json" "$work/strategy-2"
mkdir -p "$work/stage-2/profiles" "$work/stage-2/assets"
: > "$work/stage-2/manifest.tsv"
FLOWSEAL_TOTAL=0
import_one "$second" "$version" "$source_root" "$work/stage-2/profiles" "$work/stage-2/assets" "$work/stage-2/manifest.tsv"
new_profile="$work/stage-2/profiles/flowseal-x-general-alt12.json"
grep -q '"compatible": true' "$new_profile"
grep -q 'quic_initial_www_google_com_v2.bin' "$new_profile"
install_staged "$version" "$work/stage-2/profiles" "$work/stage-2/assets" "$work/stage-2/manifest.tsv" "$work/report.json" "$jobdir" deadbeef
[ -f "$ASSET_ROOT/$version/bin/quic_initial_www_google_com_v2.bin" ]
[ ! -e "$old_asset" ]
grep -q 'quic_initial_www_google_com_v2.bin' "$PROFILE_ROOT/flowseal-x-general-alt12.json"
[ -f "$ASSET_ROOT/$version/lists/list-general-user.txt" ]
[ ! -s "$ASSET_ROOT/$version/lists/list-general-user.txt" ]

. "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/service"
OWZ_PROFILE_BLOBS=$(sed -n 's/^requirements.blobs=//p' "$work/canon-2" | tr ',' '\n')
OWZ_PROFILE_HOSTLISTS=$(sed -n 's/^requirements.hostlists=//p' "$work/canon-2" | tr ',' '\n')
OWZ_PROFILE_IPSETS=$(sed -n 's/^requirements.ipsets=//p' "$work/canon-2" | tr ',' '\n')
owz_profile_requirements_ready
[ -z "$OWZ_MISSING_REQUIREMENT" ]
OWZ_PROFILE_BLOBS="$ASSET_ROOT/$version/bin/missing.bin"
if owz_profile_requirements_ready; then exit 1; fi
[ "$OWZ_MISSING_REQUIREMENT" = "$ASSET_ROOT/$version/bin/missing.bin" ]

# Ошибка подготовки не должна заменять уже установленный набор.
if install_staged "$version" "$work/stage-2/profiles" "$work/stage-2/assets" "$work/stage-2/manifest.tsv" "$work/missing-report.json" "$jobdir" deadbeef; then exit 1; fi
[ -f "$ASSET_ROOT/$version/bin/quic_initial_www_google_com_v2.bin" ]
[ ! -e "$old_asset" ]
printf '%s\n' 'Same-version asset replacement and requirement checks passed'
