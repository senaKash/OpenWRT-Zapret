#
# Copyright (c) 2024 remittor
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-zapret2
PKG_VERSION:=0.9.20260307
PKG_RELEASE:=13
PKG_LICENSE:=MIT
PKG_MAINTAINER:=OpenWRTZapret contributors

LUCI_TITLE:=OpenWRTZapret LuCI interface for Zapret2
LUCI_DEPENDS:=+zapret2 +rpcd-mod-ucode +jsonfilter +coreutils-sha256sum +curl
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	chmod 0755 /usr/libexec/openwrtzapret/service /usr/libexec/openwrtzapret/recovery-worker /usr/libexec/openwrtzapret/flowseal-update /etc/init.d/openwrtzapret-recovery
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
