#
# Copyright (c) 2024 remittor
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-zapret2
PKG_VERSION:=0.9.20260307
PKG_RELEASE:=31
PKG_LICENSE:=MIT
PKG_MAINTAINER:=OpenWRTZapret contributors

LUCI_TITLE:=OpenWRTZapret LuCI interface for Zapret2
LUCI_DEPENDS:=+zapret2 +rpcd-mod-ucode +ucode +jsonfilter +coreutils-sha256sum +curl
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	chmod 0755 /usr/libexec/openwrtzapret/service /usr/libexec/openwrtzapret/recovery-worker /usr/libexec/openwrtzapret/flowseal-update /etc/init.d/openwrtzapret-recovery
	# Исправляем уже установленные assets от старых релизов: nfqws2 читает их после drop-privileges.
	if [ -d /etc/openwrtzapret/flowseal/assets ]; then
		chmod 0755 /etc/openwrtzapret /etc/openwrtzapret/flowseal /etc/openwrtzapret/flowseal/assets 2>/dev/null || true
		find /etc/openwrtzapret/flowseal/assets -type d -exec chmod 0755 {} \; 2>/dev/null || true
		find /etc/openwrtzapret/flowseal/assets -type f -exec chmod 0644 {} \; 2>/dev/null || true
		# r16 мог сохранить FAIL из-за старых 0700 permissions; после ремонта он устарел.
		rm -f /etc/openwrtzapret/state/results/flowseal-*.json 2>/dev/null || true
	fi
	rm -f /tmp/luci-index*
	rm -rf /tmp/luci-modulecache/
	#killall -HUP rpcd 2>/dev/null
	/etc/init.d/rpcd reload
	[ -f "/sbin/luci-reload" ] && /sbin/luci-reload
	[ -f "/etc/init.d/uhttpd" ] && /etc/init.d/uhttpd reload
fi
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
