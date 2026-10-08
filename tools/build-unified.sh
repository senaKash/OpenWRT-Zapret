#!/usr/bin/env bash
# Сборка единого APK в уже подготовленном OpenWrt buildroot/SDK.
# Не устанавливает пакет на роутер и не меняет текущие dev-пакеты.
set -euo pipefail

BUILDROOT="${OWZ_BUILDROOT:-$HOME/build/openwrt-xiaomi-ax3000t-rd03v2/openwrt}"
FEED_NAME="openwrtzapret"
PACKAGE="openwrtzapret"

[ -x "$BUILDROOT/scripts/feeds" ] || {
    echo "ERROR: scripts/feeds не найден: $BUILDROOT" >&2
    exit 1
}
[ -f "$BUILDROOT/feeds/$FEED_NAME/$PACKAGE/Makefile" ] || {
    echo "ERROR: unified package отсутствует в feed $FEED_NAME" >&2
    exit 1
}

cd "$BUILDROOT"

# Используем уже выбранные target/subtarget и конфигурацию SDK.
# Никогда не делаем git checkout/reset всего OpenWrt buildroot.
./scripts/feeds install -p "$FEED_NAME" -f "$PACKAGE"
make "package/feeds/$FEED_NAME/$PACKAGE/compile" V=s

manifest="feeds/$FEED_NAME/$PACKAGE/Makefile"
version=$(sed -n 's/^PKG_VERSION:=//p' "$manifest" | head -n1)
release=$(sed -n 's/^PKG_RELEASE:=//p' "$manifest" | head -n1)
[ -n "$version" ] && [ -n "$release" ] || {
    echo 'ERROR: Не удалось определить версию пакета' >&2
    exit 1
}

# Не выдаём старый APK от другой сборки за новый.
mapfile -t matches < <(find "$BUILDROOT/bin/packages" -type f \
    -path "*/$FEED_NAME/$PACKAGE-$version-r$release.apk" -print 2>/dev/null)
if [ "${#matches[@]}" -ne 1 ]; then
    echo "ERROR: Ожидался один APK $PACKAGE-$version-r$release.apk, найдено: ${#matches[@]}" >&2
    printf '%s\n' "${matches[@]}" >&2
    exit 1
fi

printf '\nГотов единый APK (%s):\n%s\n' "$(du -h "${matches[0]}" | cut -f1)" "${matches[0]}"
echo 'ВНИМАНИЕ: экспериментальный пакет; на рабочий роутер поверх zapret2/luci-app-zapret2 НЕ ставить.'
