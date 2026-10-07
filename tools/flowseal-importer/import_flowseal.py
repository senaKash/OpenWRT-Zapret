#!/usr/bin/env python3
"""Безопасное преобразование BAT Flowseal в профиль OpenWRTZapret."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

MAX_BAT_SIZE = 256 * 1024
RUNTIME_ROOT = "/etc/openwrtzapret/flowseal"

GAME_FILTERS = {
    "none": ("12", "12"),
    "all": ("1024-65535", "1024-65535"),
    "tcp": ("1024-65535", "12"),
    "udp": ("12", "1024-65535"),
}

# Одна таблица определяет переносимые, преобразуемые и файловые параметры.
OPTION_CLASS = dict.fromkeys((
    "filter-tcp", "filter-udp", "filter-l7", "filter-l3",
    "hostlist-domains", "hostlist-exclude-domains",
), "pass")
OPTION_CLASS.update(dict.fromkeys(("hostlist", "hostlist-exclude"), "hostlists"))
OPTION_CLASS.update(dict.fromkeys(("ipset", "ipset-exclude"), "ipsets"))
OPTION_CLASS.update(dict.fromkeys((
    "dpi-desync-fake-quic", "dpi-desync-fake-discord", "dpi-desync-fake-stun",
    "dpi-desync-fake-tls", "dpi-desync-fake-http", "dpi-desync-fake-unknown",
    "dpi-desync-fake-unknown-udp", "dpi-desync-split-seqovl-pattern",
), "blobs"))
OPTION_CLASS.update(dict.fromkeys(("wf-tcp", "wf-udp"), "global"))
OPTION_CLASS.update(dict.fromkeys((
    "ip-id", "dpi-desync", "dpi-desync-repeats", "dpi-desync-fooling",
    "dpi-desync-fakedsplit-pattern", "dpi-desync-split-pos",
    "dpi-desync-split-seqovl", "dpi-desync-any-protocol", "dpi-desync-cutoff",
    "dpi-desync-fake-tls-mod", "dpi-desync-hostfakesplit-mod",
    "dpi-desync-badseq-increment",
), "translate"))

@dataclass
class Group:
    options: list[tuple[str, str]] = field(default_factory=list)
    game_filter_only: bool = False

    def values(self, key: str) -> list[str]:
        return [v for k, v in self.options if k == key]

    def one(self, key: str, default: str = "") -> str:
        vals = self.values(key)
        return vals[-1] if vals else default


def die(msg: str) -> None:
    raise ValueError(msg)


def logical_lines(text: str) -> list[str]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    buf = ""
    for raw in lines:
        line = raw.rstrip()
        if not buf and (not line.strip() or line.lstrip().startswith("::")):
            continue
        if line.endswith("^"):
            buf += line[:-1].rstrip() + " "
            continue
        buf += line
        if buf.strip():
            out.append(buf.strip())
        buf = ""
    if buf.strip():
        out.append(buf.strip())
    return out


def cmd_tokens(line: str) -> list[str]:
    # Кавычки группируют пробелы; ^! означает буквальный ! в BAT.
    tokens: list[str] = []
    buf: list[str] = []
    quoted = False
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == '"':
            quoted = not quoted
        elif ch == "^" and i + 1 < len(line) and line[i + 1] == "!":
            buf.append("!")
            i += 1
        elif ch.isspace() and not quoted:
            if buf:
                tokens.append("".join(buf))
                buf = []
        else:
            buf.append(ch)
        i += 1
    if quoted:
        die("unterminated quote in BAT command")
    if buf:
        tokens.append("".join(buf))
    return tokens


def extract_winws_args(text: str) -> list[str]:
    for line in logical_lines(text):
        if "winws.exe" not in line.lower():
            continue
        toks = cmd_tokens(line)
        if not toks or toks[0].lower() != "start":
            die("unsupported BAT command before winws.exe")
        for i, tok in enumerate(toks):
            if tok.lower().replace("\\", "/") == "%bin%winws.exe":
                if i != 3 or toks[2].lower() != "/min":
                    die("unsafe or unsupported winws invocation")
                return toks[i + 1:]
        die("unsafe or unsupported winws invocation")
    die("winws.exe command not found")


def sanitize_source_version(source_version: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", source_version)[:64] or "unknown"


def resolve_vars(value: str, game_mode: str, runtime_root: str) -> str:
    gtcp, gudp = GAME_FILTERS[game_mode]
    replacements = {
        "%GameFilterTCP%": gtcp,
        "%GameFilterUDP%": gudp,
        "%BIN%": f"{runtime_root}/bin/",
        "%LISTS%": f"{runtime_root}/lists/",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    # Any other CMD variable would make the translation ambiguous.
    if "%" in value:
        die(f"unresolved variable: {value}")
    return value.replace("\\", "/")


def parse_options(args: list[str], game_mode: str, runtime_root: str) -> tuple[dict[str, str], list[Group], list[str]]:
    global_opts: dict[str, str] = {}
    groups = [Group()]
    unsupported: list[str] = []
    for raw in args:
        if raw == "--new":
            if groups[-1].options:
                groups.append(Group())
            continue
        if not raw.startswith("--"):
            unsupported.append(f"token:{raw}")
            continue
        body = raw[2:]
        if "=" not in body:
            unsupported.append(raw)
            continue
        key, value = body.split("=", 1)
        raw_value = value
        if key in ("filter-tcp", "filter-udp") and raw_value.strip().lower() in ("%gamefiltertcp%", "%gamefilterudp%"):
            groups[-1].game_filter_only = True
        try:
            value = resolve_vars(value, game_mode, runtime_root)
        except ValueError as exc:
            unsupported.append(str(exc))
            continue
        kind = OPTION_CLASS.get(key)
        if kind is None:
            unsupported.append(f"unsupported option:{key}")
            continue
        # Операторы и неизвестные подстановки CMD недопустимы в значении.
        if re.search(r"[&|<>;`$^]", raw_value) or ("!" in raw_value and not (key == "dpi-desync-fake-tls" and raw_value == "!")):
            unsupported.append(f"unsafe option value:{key}")
            continue
        if key == "filter-l3" and value not in {"ipv4", "ipv6"}:
            unsupported.append(f"unsupported filter-l3:{value}")
            continue
        if key in {"hostlist-domains", "hostlist-exclude-domains"} and not re.fullmatch(r"[A-Za-z0-9.,-]+", value):
            unsupported.append(f"invalid domains:{value}")
            continue
        if key in ("wf-tcp", "wf-udp"):
            global_opts[key] = value
        else:
            groups[-1].options.append((key, value))
    if groups and not groups[-1].options:
        groups.pop()
    return global_opts, groups, unsupported


def safe_runtime_path(path: str) -> bool:
    return path.startswith(RUNTIME_ROOT + "/") and ".." not in path and bool(re.fullmatch(r"/[A-Za-z0-9_@%+.:/-]+", path))


def blob_name(path: str, aliases: dict[str, str]) -> str:
    if path in aliases:
        return aliases[path]
    stem = Path(path).stem.lower()
    base = re.sub(r"[^a-z0-9_]+", "_", stem).strip("_") or "blob"
    name = "fs_" + base
    candidate, n = name, 2
    used = set(aliases.values())
    while candidate in used:
        candidate = f"{name}_{n}"
        n += 1
    aliases[path] = candidate
    return candidate


def split_csv(value: str) -> list[str]:
    return [x.strip() for x in value.split(",") if x.strip()]


def normalize_ports(value: str, game_mode: str) -> str:
    # Flowseal uses port 12 as an intentionally inert sentinel when Game Filter is disabled.
    items = [x for x in split_csv(value) if not (game_mode == "none" and x == "12")]
    return ",".join(items)


def add_requirement(req: dict[str, list[str]], kind: str, value: str) -> None:
    if not safe_runtime_path(value):
        die(f"unsafe translated path: {value}")
    if value not in req[kind]:
        req[kind].append(value)


def blob_literal(key: str, value: str) -> str:
    if re.fullmatch(r"0x(?:[0-9A-Fa-f]{2})+", value):
        return value
    if key == "dpi-desync-fake-tls" and value == "!":
        return "fake_default_tls"
    return ""


def tls_mod(value: str, unsupported: list[str]) -> str:
    if not value:
        return ""
    for part in split_csv(value):
        if part not in {"none", "rnd", "rndsni", "dupsid", "padencap"} and not re.fullmatch(r"sni=[A-Za-z0-9.-]+", part):
            unsupported.append(f"unsupported tls mod:{part}")
            return ""
    return value


def host_mod(value: str, unsupported: list[str]) -> list[str]:
    out: list[str] = []
    for part in split_csv(value):
        if part in {"none", "altorder=0"}:
            continue
        if part == "altorder=1":
            unsupported.append("hostfakesplit altorder=1 has no equivalent in pinned nfqws2")
        elif re.fullmatch(r"host=[A-Za-z0-9.-]+", part):
            out.append(part)
        else:
            unsupported.append(f"unsupported hostfakesplit mod:{part}")
    return out


def fooling_args(value: str, badseq: str, unsupported: list[str]) -> list[str]:
    out: list[str] = []
    for item in split_csv(value):
        if item == "ts": out.append("tcp_ts=-600000")
        elif item == "badseq":
            increment = badseq or "-10000"
            if re.fullmatch(r"-?[0-9]+", increment):
                out.append(f"tcp_seq={increment}")
            else:
                unsupported.append(f"invalid badseq increment:{increment}")
        elif item == "badsum": out.append("badsum")
        elif item == "md5sig": out.append("tcp_md5")
        elif item in ("none", ""): pass
        else: unsupported.append(f"unsupported fooling:{item}")
    return out


def payload_for(group: Group) -> str:
    anyproto = group.one("dpi-desync-any-protocol")
    if anyproto == "1":
        return "all"
    l7 = set(split_csv(group.one("filter-l7")))
    udp = bool(group.one("filter-udp"))
    tcp = bool(group.one("filter-tcp"))
    if l7 & {"discord", "stun"}:
        vals: list[str] = []
        if "discord" in l7: vals.append("discord_ip_discovery")
        if "stun" in l7: vals.append("stun")
        if "quic" in l7: vals.insert(0, "quic_initial")
        return ",".join(vals)
    if udp and group.values("dpi-desync-fake-quic"):
        return "quic_initial"
    if tcp:
        ports = set(split_csv(group.one("filter-tcp")))
        if "80" in ports:
            return "tls_client_hello,http_req"
        return "tls_client_hello"
    return "all"


def convert_group(group: Group, req: dict[str, list[str]], blob_aliases_global: dict[str, str], unsupported: list[str]) -> list[str]:
    out: list[str] = []
    blob_alias: dict[str, list[str]] = {}
    tls_alias_mod: dict[str, str] = {}
    last_tls = ""

    # Файлы учитываются отдельно от inline hex и специального стандартного TLS fake.
    for key, value in group.options:
        kind = OPTION_CLASS[key]
        if key == "dpi-desync-fake-tls-mod":
            if last_tls:
                tls_alias_mod[last_tls] = tls_mod(value, unsupported)
            continue
        if kind not in {"hostlists", "ipsets", "blobs"}:
            continue
        if kind in {"hostlists", "ipsets"}:
            add_requirement(req, kind, value)
            continue
        alias = blob_literal(key, value)
        if not alias:
            add_requirement(req, "blobs", value)
            alias = blob_name(value, blob_aliases_global)
        blob_alias.setdefault(key, []).append(alias)
        if key == "dpi-desync-fake-tls":
            last_tls = alias

    for key, value in group.options:
        if OPTION_CLASS[key] in {"pass", "hostlists", "ipsets"}:
            out.append(f"--{key}={value}")

    base_payload = payload_for(group)

    cutoff = group.one("dpi-desync-cutoff")
    if cutoff:
        if re.fullmatch(r"[ndbs][0-9]+", cutoff):
            out.append(f"--out-range=-{cutoff}")
        else:
            unsupported.append(f"unsupported cutoff:{cutoff}")

    modes = split_csv(group.one("dpi-desync"))
    repeats = group.one("dpi-desync-repeats")
    if repeats and not re.fullmatch(r"[1-9][0-9]{0,2}", repeats):
        unsupported.append(f"invalid repeats:{repeats}")
        repeats = ""
    fool = fooling_args(group.one("dpi-desync-fooling"), group.one("dpi-desync-badseq-increment"), unsupported)
    ipid = group.one("ip-id")
    if ipid and ipid not in {"zero", "seq", "rnd", "none"}:
        unsupported.append(f"unsupported ip-id:{ipid}")
        ipid = ""

    def aliases_for(key: str) -> list[str]:
        return blob_alias.get(key, [])

    # nfqws1 can have multiple protocol-specific fake payloads. nfqws2 uses a
    # C-level --payload filter followed by one or more Lua fake instances.
    specs: list[tuple[str, list[str]]] = []
    if aliases_for("dpi-desync-fake-quic"):
        specs.append(("quic_initial", aliases_for("dpi-desync-fake-quic")))
    if aliases_for("dpi-desync-fake-discord"):
        specs.append(("discord_ip_discovery", aliases_for("dpi-desync-fake-discord")))
    if aliases_for("dpi-desync-fake-stun"):
        specs.append(("stun", aliases_for("dpi-desync-fake-stun")))
    if aliases_for("dpi-desync-fake-tls"):
        specs.append(("tls_client_hello", aliases_for("dpi-desync-fake-tls")))
    if aliases_for("dpi-desync-fake-http"):
        specs.append(("http_req", aliases_for("dpi-desync-fake-http")))
    if aliases_for("dpi-desync-fake-unknown"):
        specs.append(("unknown", aliases_for("dpi-desync-fake-unknown")))
    if aliases_for("dpi-desync-fake-unknown-udp"):
        specs.append(("unknown", aliases_for("dpi-desync-fake-unknown-udp")))

    def desync_args(mode: str, payload: str, fake_alias: str = "") -> list[str]:
        args: list[str] = []
        if mode == "fake":
            if fake_alias:
                args.append(f"blob={fake_alias}")
            if payload == "tls_client_hello":
                mod = tls_alias_mod.get(fake_alias, "")
                if not mod and fake_alias == "fake_default_tls":
                    mod = tls_mod(group.one("dpi-desync-fake-tls-mod"), unsupported)
                if not mod:
                    mod = "rnd,rndsni,dupsid" if fake_alias == "fake_default_tls" else "none"
                args.append(f"tls_mod={mod}")
            if repeats:
                args.append(f"repeats={repeats}")
            args.extend(fool)
            if ipid and ipid != "none":
                args.append(f"ip_id={ipid}")
        elif mode == "hostfakesplit":
            args.extend(host_mod(group.one("dpi-desync-hostfakesplit-mod"), unsupported))
            args.extend(fool)
            if ipid and ipid != "none":
                args.append(f"ip_id={ipid}")
            if repeats:
                args.append(f"repeats={repeats}")
        else:
            pos = group.one("dpi-desync-split-pos")
            if pos:
                args.append(f"pos={pos}")
            if mode == "fakedsplit":
                pat = group.one("dpi-desync-fakedsplit-pattern")
                if pat:
                    if pat.startswith("0x"):
                        args.append(f"pattern={pat}")
                    else:
                        unsupported.append("file fakedsplit pattern is not mapped")
            if mode in {"multisplit", "multidisorder"}:
                seqovl = group.one("dpi-desync-split-seqovl")
                if seqovl:
                    if re.fullmatch(r"[0-9]+", seqovl):
                        args.append(f"seqovl={seqovl}")
                    else:
                        unsupported.append(f"invalid seqovl:{seqovl}")
                pat = group.one("dpi-desync-split-seqovl-pattern")
                if pat:
                    if pat.startswith("0x"):
                        args.append(f"seqovl_pattern={pat}")
                    else:
                        aliases = blob_alias.get("dpi-desync-split-seqovl-pattern", [])
                        if aliases:
                            args.append(f"seqovl_pattern={aliases[-1]}")
            # Фулинг относится к фейкам fakedsplit, а не к исходным multisplit.
            if mode == "fakedsplit":
                args.extend(fool)
            if ipid and ipid != "none":
                args.append(f"ip_id={ipid}")
        return args

    supported_modes = {"fake", "fakedsplit", "multisplit", "multidisorder", "hostfakesplit", "syndata"}
    for mode in modes:
        if mode not in supported_modes:
            unsupported.append(f"unsupported desync mode:{mode}")

    if "fake" in modes and not specs:
        if base_payload == "quic_initial":
            specs = [(base_payload, ["fake_default_quic"])]
        elif "tls_client_hello" in base_payload:
            specs = [("tls_client_hello", ["fake_default_tls"])]
            if "http_req" in base_payload:
                specs.append(("http_req", ["fake_default_http"]))
        elif base_payload == "http_req":
            specs = [(base_payload, ["fake_default_http"])]
        elif base_payload in {"discord_ip_discovery", "stun", "discord_ip_discovery,stun"}:
            # zapret2 has no protocol-specific built-in for these nfqws1 fake
            # types that can safely be assumed equivalent.
            unsupported.append("fake_without_explicit_blob_for_discord_or_stun")
        elif base_payload == "all":
            unsupported.append("fake_without_blob_for_unknown_payload")

    # SYN обрабатывается как empty payload до фильтров пакетов с данными.
    if "syndata" in modes:
        out.extend(("--payload=empty", "--lua-desync=syndata"))
    if modes == ["syndata"]:
        return out

    payload_specs = specs if specs else [(base_payload, [])]
    for payload, fake_aliases in payload_specs:
        out.append(f"--payload={payload}")
        for mode in modes:
            if mode not in supported_modes or mode == "syndata":
                continue
            if mode == "fake":
                for alias in fake_aliases:
                    args = desync_args(mode, payload, alias)
                    out.append("--lua-desync=" + mode + (":" + ":".join(args) if args else ""))
            else:
                args = desync_args(mode, payload)
                out.append("--lua-desync=" + mode + (":" + ":".join(args) if args else ""))

    return out


def slugify(filename: str) -> str:
    stem = Path(filename).stem.lower()
    stem = re.sub(r"[^a-z0-9]+", "-", stem).strip("-")
    return stem or "strategy"


def slugify_value(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "unknown"


def profile_hash(profile: dict) -> str:
    req = profile["requirements"]
    lines = [
        ("id", profile["id"]), ("name", profile["name"]), ("source", profile["source"]),
        ("source_version", profile["source_version"]),
        ("compatible", "true" if profile["compatible"] else "false"),
        ("tcp_ports", profile["tcp_ports"]), ("udp_ports", profile["udp_ports"]),
        ("nfqws2", profile["nfqws2"]),
        ("requirements.blobs", ",".join(req["blobs"])),
        ("requirements.hostlists", ",".join(req["hostlists"])),
        ("requirements.ipsets", ",".join(req["ipsets"])),
    ]
    data = "".join(f"{k}={v}\n" for k, v in lines).encode()
    return "sha256:" + hashlib.sha256(data).hexdigest()


def convert_file(path: Path, source_version: str, game_mode: str) -> dict:
    if path.is_symlink() or not path.is_file():
        die("input must be a regular non-symlink file")
    if path.stat().st_size > MAX_BAT_SIZE:
        die("BAT file too large")
    if not re.fullmatch(r"general(?: \([^\r\n/]+\))?\.bat", path.name, re.I):
        die("only general*.bat Flowseal strategies are accepted")

    version = sanitize_source_version(source_version)
    runtime_root = f"{RUNTIME_ROOT}/assets/{version}"
    text = path.read_text(encoding="utf-8-sig", errors="strict")
    try:
        args = extract_winws_args(text)
    except ValueError as exc:
        args = []
        global_opts, groups, unsupported = {}, [], [str(exc)]
    else:
        global_opts, groups, unsupported = parse_options(args, game_mode, runtime_root)
    req = {"blobs": [], "hostlists": [], "ipsets": []}
    blob_aliases_global: dict[str, str] = {}
    converted_groups: list[list[str]] = []
    warnings: list[str] = []

    for idx, group in enumerate(groups):
        if group.game_filter_only and game_mode == "none":
            if "Flowseal GameFilter-only branches omitted" not in warnings:
                warnings.append("Flowseal GameFilter-only branches omitted")
            continue
        try:
            converted = convert_group(group, req, blob_aliases_global, unsupported)
        except ValueError as exc:
            unsupported.append(f"group {idx + 1}: {exc}")
            converted = []
        if converted:
            converted_groups.append(converted)

    nfq_parts: list[str] = []
    # Stable, unique blob declarations before all multi-strategy groups.
    for source_path, alias in blob_aliases_global.items():
        nfq_parts.append(f"--blob={alias}:@{source_path}")
    for idx, converted in enumerate(converted_groups):
        if idx:
            nfq_parts.append("--new")
        nfq_parts.extend(converted)

    tcp = normalize_ports(global_opts.get("wf-tcp", ""), game_mode)
    udp = normalize_ports(global_opts.get("wf-udp", ""), game_mode)
    strategy_hash = "sha256:" + hashlib.sha256(("game_filter=" + game_mode + "\n" + "\n".join(args) + "\n").encode()).hexdigest()
    sid = "flowseal-" + slugify_value(version) + "-" + slugify(path.name)
    profile = {
        "id": sid,
        "name": path.stem,
        "source": "flowseal",
        "source_version": version,
        "compatible": not unsupported and bool(converted_groups),
        "tcp_ports": tcp,
        "udp_ports": udp,
        "nfqws2": " ".join(nfq_parts),
        "requirements": req,
        "content_hash": "",
        "import": {
            "format": "flowseal-winws-v1",
            "original_file": path.name,
            "game_filter_mode": game_mode,
            "strategy_hash": strategy_hash,
            "warnings": warnings,
            "unsupported": sorted(set(unsupported)),
        },
    }
    profile["content_hash"] = profile_hash(profile)
    return profile


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path, help="general*.bat file or directory")
    ap.add_argument("--output-dir", type=Path, required=True)
    ap.add_argument("--source-version", default="unknown")
    ap.add_argument("--game-filter", choices=sorted(GAME_FILTERS), default="none")
    ap.add_argument("--report", type=Path)
    ns = ap.parse_args()

    if ns.input.is_dir():
        files = sorted(p for p in ns.input.iterdir() if p.is_file() and re.fullmatch(r"general.*\.bat", p.name, re.I))
    else:
        files = [ns.input]
    if not files:
        print("no general*.bat files found", file=sys.stderr)
        return 2

    ns.output_dir.mkdir(parents=True, exist_ok=True)
    report = {"source_version": ns.source_version, "game_filter": ns.game_filter, "profiles": []}
    for src in files:
        try:
            profile = convert_file(src, ns.source_version, ns.game_filter)
            dest = ns.output_dir / f"{profile['id']}.json"
            dest.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
            report["profiles"].append({
                "file": src.name, "id": profile["id"], "compatible": profile["compatible"],
                "unsupported": profile["import"]["unsupported"], "output": str(dest),
            })
        except Exception as exc:
            report["profiles"].append({"file": src.name, "compatible": False, "error": str(exc)})

    if ns.report:
        ns.report.parent.mkdir(parents=True, exist_ok=True)
        ns.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if any("error" in p for p in report["profiles"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
