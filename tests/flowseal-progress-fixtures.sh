#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
mkdir -p "$work/jobs" "$work/flowseal-state"

# Run the updater against local fixtures; no download or router paths are used.
sed '/^case "${1:-}" in/,$d' "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-update" |
    sed "s|/etc/openwrtzapret/state/jobs/|$work/jobs/|g" > "$work/updater-functions"
. "$work/updater-functions"
STATE_ROOT="$work/flowseal-state"
PROFILE_ROOT="$work/profiles"
RESULT_ROOT="$work/results"
LOCK_FILE="$work/locks"

fetch_latest() { printf '1.10.3'; }
curl() {
    while [ "$#" -gt 0 ]; do
        if [ "$1" = -o ]; then shift; archive_out=$1; fi
        shift
    done
    cp "$TEST_JOBDIR/progress.json" "$work/download-progress"
    [ "$MOCK_DOWNLOAD_FAIL" = false ] || return 1
    printf 'fixture archive\n' > "$archive_out"
}
extract_selected() { return 0; }
find_release_root() {
    local extract="$1" list="$2" n=1
    cp "$TEST_JOBDIR/progress.json" "$work/extract-progress"
    : > "$list"
    while [ "$n" -le "$MOCK_TOTAL" ]; do
        : > "$extract/general-$n.bat"
        printf '%s\n' "$extract/general-$n.bat" >> "$list"
        n=$((n + 1))
    done
    printf '%s' "$extract"
}
import_one() {
    local observed expected compatible=true
    observed=$(sed -n 's/.*"current":\([0-9][0-9]*\),"total":.*/\1/p' "$TEST_JOBDIR/progress.json")
    expected=$MOCK_IMPORTED
    [ "$observed" = "$expected" ] || return 1
    MOCK_IMPORTED=$((MOCK_IMPORTED + 1))
    [ "$MOCK_IMPORTED" -le "$((MOCK_TOTAL - MOCK_UNSUPPORTED))" ] || compatible=false
    printf '%s\tsha256:%s\tflowseal-%s\t%s\n' "$7" "$MOCK_IMPORTED" "$MOCK_IMPORTED" "$compatible" >> "$6"
    printf '%s\n' "$observed" >> "$work/observed"
    [ "$MOCK_CANCEL_AFTER" -ne "$MOCK_IMPORTED" ] || : > "$TEST_JOBDIR/cancel"
}
install_staged() {
    cp "$TEST_JOBDIR/progress.json" "$work/saving-progress"
    return 0
}

run_fixture() {
    TEST_JOBDIR="$work/jobs/$1"
    mkdir -p "$TEST_JOBDIR"
    MOCK_IMPORTED=0
    : > "$work/observed"
    run_update "$TEST_JOBDIR"
    trap 'rm -rf "$work"' EXIT INT TERM
}

MOCK_TOTAL=22 MOCK_UNSUPPORTED=0 MOCK_CANCEL_AFTER=0 MOCK_DOWNLOAD_FAIL=false
: > "$STATE_ROOT/manifest.tsv"
n=1
while [ "$n" -le 22 ]; do
    printf 'general-%s\tsha256:%s\tflowseal-%s\ttrue\n' "$n" "$n" "$n" >> "$STATE_ROOT/manifest.tsv"
    n=$((n + 1))
done
run_fixture 1-1
[ "$(wc -l < "$work/observed")" -eq 22 ]
[ "$(sed -n '1p' "$work/observed")" = 0 ]
[ "$(sed -n '22p' "$work/observed")" = 21 ]
grep -Fq '"stage":"downloading","profile_id":null,"current":0,"total":0' "$work/download-progress"
grep -Fq '"stage":"extracting","profile_id":null,"current":0,"total":0' "$work/extract-progress"
grep -Fq '"stage":"saving","profile_id":null,"current":22,"total":22' "$work/saving-progress"
grep -Fq '"current":22,"total":22' "$TEST_JOBDIR/progress.json"
grep -Fq '"unchanged":22,"unsupported":0' "$TEST_JOBDIR/result.json"

MOCK_UNSUPPORTED=2
run_fixture 1-2
grep -Fq '"current":22,"total":22' "$TEST_JOBDIR/progress.json"
grep -Fq '"unchanged":20,"unsupported":2' "$TEST_JOBDIR/result.json"

awk -F '\t' '$1=="general-19" {next} $1=="general-20" {$2="sha256:old"} {print $1 "\t" $2 "\t" $3 "\t" $4}' \
    "$STATE_ROOT/manifest.tsv" > "$work/old-manifest"
mv "$work/old-manifest" "$STATE_ROOT/manifest.tsv"
run_fixture 1-9
grep -Fq '"added":1,"changed":1,"unchanged":18,"unsupported":2' "$TEST_JOBDIR/result.json"

MOCK_CANCEL_AFTER=5
TEST_JOBDIR="$work/jobs/1-3"; mkdir -p "$TEST_JOBDIR"; MOCK_IMPORTED=0
set +e
run_update "$TEST_JOBDIR"
rc=$?
set -e
[ "$rc" -eq 130 ]
grep -Fq '"current":5,"total":22' "$TEST_JOBDIR/progress.json"
grep -Fq '"status":"CANCELLED"' "$TEST_JOBDIR/result.json"

MOCK_CANCEL_AFTER=0 MOCK_DOWNLOAD_FAIL=true
TEST_JOBDIR="$work/jobs/1-4"; mkdir -p "$TEST_JOBDIR"
set +e
run_update "$TEST_JOBDIR"
rc=$?
set -e
[ "$rc" -eq 1 ]
grep -Fq '"stage":"downloading","profile_id":null,"current":0,"total":0' "$TEST_JOBDIR/progress.json"
grep -Fq '"stage":"download","error":"release_download_failed"' "$TEST_JOBDIR/result.json"

# The service exposes child progress while RUNNING and terminal state afterwards.
set +u
. "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/service"
OWZ_JOB_ROOT="$work/jobs"
OWZ_JOURNAL="$work/journal"
mkdir -p "$OWZ_JOURNAL"
jsonfilter() {
    local key=${4#@.}
    case "$key" in
        current|total) sed -n "s/.*\"$key\":\([0-9][0-9]*\).*/\1/p" "$2";;
        stage|error) sed -n "s/.*\"$key\":\"\([^\"]*\)\".*/\1/p" "$2";;
    esac
}
dir="$work/jobs/1-5"; mkdir -p "$dir"
owz_job_state_write "$dir" 1-5 flowseal_update RUNNING checking '' 0 0 ''
cp "$work/saving-progress" "$dir/progress.json"
printf '1-5\n' > "$OWZ_JOURNAL/active"
owz_job_status 1-5 | grep -Fq '"stage":"saving","profile_id":null,"current":22,"total":22'
owz_job_current | grep -Fq '"stage":"saving","profile_id":null,"current":22,"total":22'
owz_job_progress_counts "$dir"
[ "$OWZ_PROGRESS_CURRENT" -eq 22 ] && [ "$OWZ_PROGRESS_TOTAL" -eq 22 ]
owz_job_state_write "$dir" 1-5 flowseal_update DONE complete '' 22 22 ''
owz_job_status 1-5 | grep -Fq '"status":"DONE","stage":"complete"'

cat > "$work/updater-stub" <<'EOF'
#!/bin/sh
cp "$MOCK_UPDATER_PROGRESS" "$2/progress.json"
cp "$MOCK_UPDATER_RESULT" "$2/result.json"
exit "$MOCK_UPDATER_RC"
EOF
chmod +x "$work/updater-stub"
OWZ_FLOWSEAL_UPDATE="$work/updater-stub"
owz_lock() { return 0; }
run_service_job() {
    local job="$1" expected="$2" dir="$work/jobs/$1"
    mkdir -p "$dir"
    printf 'flowseal_update\n' > "$dir/mode"
    printf 'worker_pid=0\n' > "$dir/meta"
    printf '%s\n' "$job" > "$OWZ_JOURNAL/active"
    set +e
    owz_job_run "$job"
    rc=$?
    set -e
    [ "$rc" -eq 0 ]
    owz_job_status "$job" | grep -Fq "$expected"
}
MOCK_UPDATER_PROGRESS="$work/jobs/1-2/progress.json"
MOCK_UPDATER_RESULT="$work/jobs/1-2/result.json"
MOCK_UPDATER_RC=0
export MOCK_UPDATER_PROGRESS MOCK_UPDATER_RESULT MOCK_UPDATER_RC
run_service_job 1-6 '"status":"DONE","stage":"complete","profile_id":null,"current":22,"total":22'
MOCK_UPDATER_PROGRESS="$work/jobs/1-3/progress.json"
MOCK_UPDATER_RESULT="$work/jobs/1-3/result.json"
MOCK_UPDATER_RC=130
export MOCK_UPDATER_PROGRESS MOCK_UPDATER_RESULT MOCK_UPDATER_RC
run_service_job 1-7 '"status":"CANCELLED","stage":"complete","profile_id":null,"current":5,"total":22'
MOCK_UPDATER_PROGRESS="$work/jobs/1-4/progress.json"
MOCK_UPDATER_RESULT="$work/jobs/1-4/result.json"
MOCK_UPDATER_RC=1
export MOCK_UPDATER_PROGRESS MOCK_UPDATER_RESULT MOCK_UPDATER_RC
run_service_job 1-8 '"status":"ERROR","stage":"download","profile_id":null,"current":0,"total":0,"error":"release_download_failed"'

{
    printf '#!/bin/sh\nrun_update() { return "$MOCK_RUN_RC"; }\n'
    sed -n '/^case "${1:-}" in/,$p' "$root/luci-app-zapret2/root/usr/libexec/openwrtzapret/flowseal-update"
} > "$work/updater-dispatch"
set +e
MOCK_RUN_RC=130 sh "$work/updater-dispatch" run "$work/jobs/1-3"
rc=$?
set -e
[ "$rc" -eq 130 ]

trap 'rm -rf "$work"' EXIT INT TERM
printf '%s\n' 'Flowseal update progress fixtures passed'
