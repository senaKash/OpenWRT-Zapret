# OpenWRTZapret profile format

Profiles are JSON files. Built-ins live under `/usr/share/openwrtzapret/profiles/builtin`; future Flowseal and user profiles live under `/etc/openwrtzapret/profiles/{flowseal,user}`. UCI stores only `active_profile`; no pointer means **Manual / Settings** mode.

Required fields: `id`, `name`, `source`, `source_version`, `compatible`, `tcp_ports`, `udp_ports`, `nfqws2`, `requirements`, `content_hash`. `requirements` is an object with `blobs`, `hostlists`, and `ipsets` arrays. `compatible=false` keeps a reference/imported profile visible but blocks Apply.

TCP/UDP entries are comma-separated ports or ascending ranges within `1..65535`. `nfqws2` is validated as data, not shell syntax; safe `@/path` references are allowed and shell metacharacters are rejected. Requirement entries are absolute, traversal-free file paths.

`content_hash` is SHA-256 over normalized key/value lines in this order: `id`, `name`, `source`, `source_version`, `compatible`, `tcp_ports`, `udp_ports`, `nfqws2`, `requirements.blobs`, `requirements.hostlists`, `requirements.ipsets`. Requirement arrays are comma-joined in stored order before hashing.
