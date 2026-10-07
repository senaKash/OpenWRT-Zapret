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
RESULT_ROOT="$work/results"
IMPORT_AWK="$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-import.awk"
version=X
runtime_base="$RUNTIME_ASSET_ROOT/$version"
source_root="$work/source"
jobdir="$work/job"
mkdir -p "$source_root" "$jobdir"

# Минимальный fake zapret2 проверяет, что updater использует upstream helpers,
# грузит их один раз и делает один dry-run на совместимый импорт.
ZAPRET_BASE="$work/zapret2"
OWZ_ZAPRET2_VALIDATOR_READY=0
OWZ_TEST_LOAD_LOG="$work/validator-load.log"
OWZ_TEST_DRY_RUN_LOG="$work/dry-run.log"
OWZ_TEST_DRY_RUN_FAIL=0
mkdir -p "$ZAPRET_BASE/common" "$ZAPRET_BASE/nfq2"
printf '%s\n' 'MODE_FILTER=none' 'QNUM=300' > "$ZAPRET_BASE/config"
cat > "$ZAPRET_BASE/common/base.sh" <<'EOF'
printf '%s\n' load >> "$OWZ_TEST_LOAD_LOG"
contains() { [ "${1#*$2}" != "$1" ]; }
replace_str() { local a="$1" b="$2"; shift 2; printf '%s\n' "$*" | sed "s#${a}#${b}#g"; }
EOF
cat > "$ZAPRET_BASE/common/installer.sh" <<'EOF'
dry_run_nfqws_() {
    printf '%s\n' "$*" >> "$OWZ_TEST_DRY_RUN_LOG"
    [ "${OWZ_TEST_DRY_RUN_FAIL:-0}" = 0 ]
}
EOF
cat > "$ZAPRET_BASE/common/list.sh" <<'EOF'
filter_apply_hostlist_target() { :; }
EOF

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
[ "$(wc -l < "$OWZ_TEST_LOAD_LOG")" -eq 1 ]
[ "$(wc -l < "$OWZ_TEST_DRY_RUN_LOG")" -eq 1 ]
grep -Fq -- "$work/stage-1/assets/" "$OWZ_TEST_DRY_RUN_LOG"
if grep -Fq -- "$runtime_base/" "$OWZ_TEST_DRY_RUN_LOG"; then exit 1; fi
printf '%s\n' '{"ok":true}' > "$work/report.json"
mkdir -p "$RESULT_ROOT"
printf '%s\n' '{"status":"FAIL"}' > "$RESULT_ROOT/flowseal-stale.json"
printf '%s\n' '{"status":"PASS"}' > "$RESULT_ROOT/user-keep.json"
install_staged "$version" "$work/stage-1/profiles" "$work/stage-1/assets" "$work/stage-1/manifest.tsv" "$work/report.json" "$jobdir" deadbeef
[ ! -e "$RESULT_ROOT/flowseal-stale.json" ]
[ -f "$RESULT_ROOT/user-keep.json" ]
old_asset="$ASSET_ROOT/$version/bin/quic_initial_www_google_com.bin"
[ -f "$old_asset" ]

# На POSIX FS режимы обязаны позволять nfqws2 читать assets после drop-privileges.
perm_probe="$work/perm-probe"
: > "$perm_probe"
chmod 600 "$perm_probe" 2>/dev/null || :
p600=$(stat -c '%a' "$perm_probe" 2>/dev/null || printf unknown)
chmod 644 "$perm_probe" 2>/dev/null || :
p644=$(stat -c '%a' "$perm_probe" 2>/dev/null || printf unknown)
if [ "$p600" != "$p644" ]; then
    [ "$(stat -c '%a' "$ASSET_ROOT" 2>/dev/null)" = 755 ]
    [ "$(stat -c '%a' "$ASSET_ROOT/$version" 2>/dev/null)" = 755 ]
    [ "$(stat -c '%a' "$ASSET_ROOT/$version/lists" 2>/dev/null)" = 755 ]
    [ "$(stat -c '%a' "$ASSET_ROOT/$version/lists/list-general-user.txt" 2>/dev/null)" = 644 ]
fi

# Повторный импорт той же версии создаёт новый requirement из изменённого BAT.
mkdir -p "$work/second"
second="$work/second/general (ALT12).bat"
sed 's/quic_initial_www_google_com\.bin/quic_initial_www_google_com_v2.bin/g' "$first" > "$second"
prepare_source "$second" "$work/canon-2" "$work/profile-2.json" "$work/strategy-2"
mkdir -p "$work/stage-2/profiles" "$work/stage-2/assets"
: > "$work/stage-2/manifest.tsv"
FLOWSEAL_TOTAL=0
import_one "$second" "$version" "$source_root" "$work/stage-2/profiles" "$work/stage-2/assets" "$work/stage-2/manifest.tsv"
[ "$(wc -l < "$OWZ_TEST_LOAD_LOG")" -eq 1 ]
[ "$(wc -l < "$OWZ_TEST_DRY_RUN_LOG")" -eq 2 ]

# Уже несовместимый на этапе конвертации профиль не должен тратить I/O на assets
# и не должен запускать nfqws2 dry-run.
bad="$work/general-bad.bat"
printf '%s\n' '@echo off' 'start "fixture" /min "%BIN%winws.exe" --wf-tcp=443 --filter-tcp=443 --dpi-desync=hostfakesplit --dpi-desync-hostfakesplit-mod=host=ya.ru,altorder=1' > "$bad"
mkdir -p "$work/stage-bad/profiles" "$work/stage-bad/assets"
: > "$work/stage-bad/manifest.tsv"
FLOWSEAL_TOTAL=0
import_one "$bad" "$version" "$source_root" "$work/stage-bad/profiles" "$work/stage-bad/assets" "$work/stage-bad/manifest.tsv"
grep -q '"compatible": false' "$work/stage-bad/profiles/flowseal-x-general-bad.json"
[ "$(wc -l < "$OWZ_TEST_DRY_RUN_LOG")" -eq 2 ]
[ -z "$(find "$work/stage-bad/assets" -type f -print -quit)" ]

new_profile="$work/stage-2/profiles/flowseal-x-general-alt12.json"
grep -q '"compatible": true' "$new_profile"
grep -q 'quic_initial_www_google_com_v2.bin' "$new_profile"
install_staged "$version" "$work/stage-2/profiles" "$work/stage-2/assets" "$work/stage-2/manifest.tsv" "$work/report.json" "$jobdir" deadbeef
[ -f "$ASSET_ROOT/$version/bin/quic_initial_www_google_com_v2.bin" ]
[ ! -e "$old_asset" ]
grep -q 'quic_initial_www_google_com_v2.bin' "$PROFILE_ROOT/flowseal-x-general-alt12.json"
[ -f "$ASSET_ROOT/$version/lists/list-general-user.txt" ]
[ ! -s "$ASSET_ROOT/$version/lists/list-general-user.txt" ]

# Если штатный dry-run отклоняет NFQWS2_OPT, профиль сохраняется как unsupported,
# а updater не пытается запускать его в Test All.
OWZ_TEST_DRY_RUN_FAIL=1
mkdir -p "$work/stage-fail/profiles" "$work/stage-fail/assets"
: > "$work/stage-fail/manifest.tsv"
FLOWSEAL_TOTAL=0
import_one "$first" "$version" "$source_root" "$work/stage-fail/profiles" "$work/stage-fail/assets" "$work/stage-fail/manifest.tsv"
grep -q '"compatible": false' "$work/stage-fail/profiles/flowseal-x-general-alt12.json"
grep -q 'zapret2 dry-run rejected strategy' "$work/stage-fail/profiles/flowseal-x-general-alt12.json"
[ "$(wc -l < "$OWZ_TEST_LOAD_LOG")" -eq 1 ]
[ "$(wc -l < "$OWZ_TEST_DRY_RUN_LOG")" -eq 3 ]
OWZ_TEST_DRY_RUN_FAIL=0

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
