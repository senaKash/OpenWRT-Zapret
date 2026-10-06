# Flowseal general*.bat -> OpenWRTZapret profile converter.
# Input is inert text. Nothing from the BAT file is executed.

function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function jesc(s,    t) {
	t=s; gsub(/\\/, "\\\\", t); gsub(/\"/, "\\\"", t); gsub(/\t/, "\\t", t); gsub(/\n/, "\\n", t); gsub(/\r/, "\\r", t); return t
}
function arr_has(csv, needle,    a,n,i) {
	n=split(csv,a,","); for(i=1;i<=n;i++) if(trim(a[i])==needle) return 1; return 0
}
function add_unique(kind, val,    k) {
	k=kind SUBSEP val; if(req_seen[k]) return;
	req_seen[k]=1;
	if(kind=="blobs") req_blob[++n_blob]=val;
	else if(kind=="hostlists") req_host[++n_host]=val;
	else if(kind=="ipsets") req_ip[++n_ip]=val;
}
function add_unsupported(s) { if(!uns_seen[s]) { uns_seen[s]=1; unsupported[++n_uns]=s } }
function add_warning(s) { if(!warn_seen[s]) { warn_seen[s]=1; warnings[++n_warn]=s } }
function safe_path(p) { return index(p, runtime_base "/") == 1 && index(p,"..") == 0 && p ~ /^\/[A-Za-z0-9_@%+.:\/-]+$/ }
function basename_noext(p,    a,n,s) { n=split(p,a,"/"); s=a[n]; sub(/\.[^.]*$/, "", s); return s }
function alias_for(path,    stem,base,cand,n,k) {
	if(path in path_alias) return path_alias[path]
	stem=tolower(basename_noext(path)); gsub(/[^a-z0-9_]+/,"_",stem); gsub(/^_+|_+$/,"",stem); if(stem=="") stem="blob"
	base="fs_" stem; cand=base; n=2
	while(alias_used[cand]) { cand=base "_" n; n++ }
	alias_used[cand]=1; path_alias[path]=cand; alias_order[++n_alias]=path; return cand
}
function resolve_value(v,    out) {
	out=v
	gsub(/%GameFilterTCP%/, game_tcp, out); gsub(/%GameFilterUDP%/, game_udp, out)
	gsub(/%BIN%/, runtime_base "/bin/", out); gsub(/%LISTS%/, runtime_base "/lists/", out)
	gsub(/\\/, "/", out)
	if(out ~ /%[^%]+%/) { add_unsupported("unresolved variable:" out); return out }
	return out
}
function known_option(k) {
	return (k=="filter-tcp" || k=="filter-udp" || k=="filter-l7" || k=="hostlist-domains" ||
	k=="hostlist" || k=="hostlist-exclude" || k=="ipset" || k=="ipset-exclude" ||
	k=="wf-tcp" || k=="wf-udp" || k=="ip-id" || k=="dpi-desync" || k=="dpi-desync-repeats" ||
	k=="dpi-desync-fooling" || k=="dpi-desync-fakedsplit-pattern" || k=="dpi-desync-split-pos" ||
	k=="dpi-desync-split-seqovl" || k=="dpi-desync-split-seqovl-pattern" || k=="dpi-desync-any-protocol" ||
	k=="dpi-desync-cutoff" || k=="dpi-desync-fake-quic" || k=="dpi-desync-fake-discord" ||
	k=="dpi-desync-fake-stun" || k=="dpi-desync-fake-tls" || k=="dpi-desync-fake-http" ||
	k=="dpi-desync-fake-unknown" || k=="dpi-desync-fake-unknown-udp")
}
function path_kind(k) {
	if(k=="hostlist" || k=="hostlist-exclude") return "hostlists"
	if(k=="ipset" || k=="ipset-exclude") return "ipsets"
	if(k=="dpi-desync-fake-quic" || k=="dpi-desync-fake-discord" || k=="dpi-desync-fake-stun" ||
	   k=="dpi-desync-fake-tls" || k=="dpi-desync-fake-http" || k=="dpi-desync-fake-unknown" ||
	   k=="dpi-desync-fake-unknown-udp" || k=="dpi-desync-split-seqovl-pattern") return "blobs"
	return ""
}
function one(g,k,    n) { n=opt_count[g SUBSEP k]; return n ? opt_val[g SUBSEP k SUBSEP n] : "" }
function values_csv(g,k,    n,i,out) { n=opt_count[g SUBSEP k]; out=""; for(i=1;i<=n;i++) out=out (out?",":"") opt_val[g SUBSEP k SUBSEP i]; return out }
function add_opt(g,k,v,    n,sn) {
	opt_count[g SUBSEP k] = opt_count[g SUBSEP k] + 1
	n=opt_count[g SUBSEP k]; opt_val[g SUBSEP k SUBSEP n]=v
	seq_count[g] = seq_count[g] + 1; sn=seq_count[g]
	seq_key[g SUBSEP sn]=k; seq_val[g SUBSEP sn]=v
}
function split_csv(v,a,    raw,n,i,c) { n=split(v,raw,","); c=0; for(i=1;i<=n;i++){ raw[i]=trim(raw[i]); if(raw[i]!="") a[++c]=raw[i] } return c }
function normalize_ports(v,    a,n,i,out) { n=split_csv(v,a); out=""; for(i=1;i<=n;i++){ if(game_mode=="none" && a[i]=="12") continue; out=out (out?",":"") a[i] } return out }
function fooling(g,    a,n,i,out,x) {
	n=split_csv(one(g,"dpi-desync-fooling"),a); out=""
	for(i=1;i<=n;i++){ x=a[i]; if(x=="ts") x="tcp_ts=-600000"; else if(x=="badseq") x="tcp_seq=-10000"; else if(x=="badsum") x="badsum"; else if(x=="md5sig") x="tcp_md5"; else if(x=="none"||x=="") continue; else { add_unsupported("unsupported fooling:" x); continue } out=out (out?":":"") x }
	return out
}
function payload_for(g,    l7,tcp,udp,p,out) {
	if(one(g,"dpi-desync-any-protocol")=="1") return "all"
	l7=one(g,"filter-l7"); tcp=one(g,"filter-tcp"); udp=one(g,"filter-udp")
	if(arr_has(l7,"discord") || arr_has(l7,"stun")) {
		out=""; if(arr_has(l7,"quic")) out="quic_initial"; if(arr_has(l7,"discord")) out=out (out?",":"") "discord_ip_discovery"; if(arr_has(l7,"stun")) out=out (out?",":"") "stun"; return out
	}
	if(udp!="" && opt_count[g SUBSEP "dpi-desync-fake-quic"]>0) return "quic_initial"
	if(tcp!="") { if(arr_has(tcp,"80")) return "tls_client_hello,http_req"; return "tls_client_hello" }
	return "all"
}
function add_arg(s) { group_out = group_out (group_out?" ":"") s }
function add_desync(mode, alias, g,    args,x,pos,pat,seqovl,fool,ipid) {
	args=""; fool=fooling(g); ipid=one(g,"ip-id")
	if(ipid!="" && ipid!="zero" && ipid!="seq" && ipid!="rnd" && ipid!="none") { add_unsupported("unsupported ip-id:" ipid); ipid="" }
	if(mode=="fake") {
		if(alias!="") args="blob=" alias
		x=one(g,"dpi-desync-repeats"); if(x!="") { if(x !~ /^[1-9][0-9]{0,2}$/) add_unsupported("invalid repeats:" x); else args=args (args?":":"") "repeats=" x }
		if(fool!="") args=args (args?":":"") fool
		if(ipid!="" && ipid!="none") args=args (args?":":"") "ip_id=" ipid
	} else {
		pos=one(g,"dpi-desync-split-pos"); if(pos!="") args="pos=" pos
		if(mode=="fakedsplit") { pat=one(g,"dpi-desync-fakedsplit-pattern"); if(pat!="") { if(pat ~ /^0x[0-9A-Fa-f]+$/) args=args (args?":":"") "pattern=" pat; else add_unsupported("file fakedsplit pattern is not mapped") } }
		if(mode=="multisplit" || mode=="multidisorder") {
			seqovl=one(g,"dpi-desync-split-seqovl"); if(seqovl!="") { if(seqovl ~ /^[0-9]+$/) args=args (args?":":"") "seqovl=" seqovl; else add_unsupported("invalid seqovl:" seqovl) }
			pat=one(g,"dpi-desync-split-seqovl-pattern"); if(pat!="") { if(pat ~ /^0x[0-9A-Fa-f]+$/) args=args (args?":":"") "seqovl_pattern=" pat; else { x=last_alias[g SUBSEP "dpi-desync-split-seqovl-pattern"]; if(x!="") args=args (args?":":"") "seqovl_pattern=" x } }
		}
		if(fool!="") args=args (args?":":"") fool
		if(ipid!="" && ipid!="none") args=args (args?":":"") "ip_id=" ipid
	}
	add_arg("--lua-desync=" mode (args!=""?":" args:""))
}
function emit_payload_modes(g,payload, aliases,    modes,nm,i,mode,aa,na,j) {
	add_arg("--payload=" payload)
	nm=split_csv(one(g,"dpi-desync"),modes)
	for(i=1;i<=nm;i++) {
		mode=modes[i]
		if(mode!="fake" && mode!="fakedsplit" && mode!="multisplit" && mode!="multidisorder") { add_unsupported("unsupported desync mode:" mode); continue }
		if(mode=="fake") { na=split_csv(aliases,aa); for(j=1;j<=na;j++) add_desync(mode,aa[j],g) }
		else add_desync(mode,"",g)
	}
}
function convert_group(g,    i,k,v,kind,alias,base,cut,modes,nm,m,hasfake,specn,p,als,j,tmp,bc,na,aa) {
	group_out=""
	# First register every referenced asset and its stable blob alias.
	for(i=1;i<=seq_count[g];i++) {
		k=seq_key[g SUBSEP i]; v=seq_val[g SUBSEP i]; kind=path_kind(k); if(kind=="") continue
		if(k=="dpi-desync-split-seqovl-pattern" && v ~ /^0x/) continue
		if(!safe_path(v)) { add_unsupported("unsafe translated path:" v); continue }
		if(kind!="blobs") { add_unique(kind,v); continue }
		if(v ~ /^0x/) continue
		add_unique("blobs",v); alias=alias_for(v); blob_key_count[g SUBSEP k]=blob_key_count[g SUBSEP k]+1; bc=blob_key_count[g SUBSEP k]; blob_key_alias[g SUBSEP k SUBSEP bc]=alias; last_alias[g SUBSEP k]=alias
	}
	# Preserve selectors/hostlists/ipsets in source order.
	for(i=1;i<=seq_count[g];i++) {
		k=seq_key[g SUBSEP i]; v=seq_val[g SUBSEP i]
		if(k=="filter-tcp"||k=="filter-udp"||k=="filter-l7"||k=="hostlist-domains"||k=="hostlist"||k=="hostlist-exclude"||k=="ipset"||k=="ipset-exclude") add_arg("--" k "=" v)
	}
	base=payload_for(g); cut=one(g,"dpi-desync-cutoff")
	if(cut!="") { if(cut ~ /^[ndbs][0-9]+$/) add_arg("--out-range=-" cut); else add_unsupported("unsupported cutoff:" cut) }
	nm=split_csv(one(g,"dpi-desync"),modes); hasfake=0
	for(i=1;i<=nm;i++) if(modes[i]=="fake") hasfake=1
	# Protocol-specific fake payloads; one payload filter per fake type.
	specn=0
	k="dpi-desync-fake-quic"; if(blob_key_count[g SUBSEP k]) { p[++specn]="quic_initial"; als[specn]=aliases_csv(g,k) }
	k="dpi-desync-fake-discord"; if(blob_key_count[g SUBSEP k]) { p[++specn]="discord_ip_discovery"; als[specn]=aliases_csv(g,k) }
	k="dpi-desync-fake-stun"; if(blob_key_count[g SUBSEP k]) { p[++specn]="stun"; als[specn]=aliases_csv(g,k) }
	k="dpi-desync-fake-tls"; if(blob_key_count[g SUBSEP k]) { p[++specn]="tls_client_hello"; als[specn]=aliases_csv(g,k) }
	k="dpi-desync-fake-http"; if(blob_key_count[g SUBSEP k]) { p[++specn]="http_req"; als[specn]=aliases_csv(g,k) }
	k="dpi-desync-fake-unknown"; if(blob_key_count[g SUBSEP k]) { p[++specn]="unknown"; als[specn]=aliases_csv(g,k) }
	k="dpi-desync-fake-unknown-udp"; if(blob_key_count[g SUBSEP k]) { p[++specn]="unknown"; als[specn]=aliases_csv(g,k) }
	if(hasfake && specn==0) {
		if(base=="quic_initial") { p[++specn]=base; als[specn]="fake_default_quic" }
		else if(index(base,"tls_client_hello")>0) { p[++specn]="tls_client_hello"; als[specn]="fake_default_tls"; if(index(base,"http_req")>0){ p[++specn]="http_req"; als[specn]="fake_default_http" } }
		else if(base=="http_req") { p[++specn]=base; als[specn]="fake_default_http" }
		else if(base=="discord_ip_discovery"||base=="stun"||base=="discord_ip_discovery,stun") add_unsupported("fake_without_explicit_blob_for_discord_or_stun")
		else if(base=="all") add_unsupported("fake_without_blob_for_unknown_payload")
	}
	if(specn==0) { emit_payload_modes(g,base,"") }
	else {
		for(i=1;i<=specn;i++) {
			# For payload-specific specs, all modes are emitted. fake gets aliases; split modes are repeated like Phase G converter.
			add_arg("--payload=" p[i]);
			for(j=1;j<=nm;j++) { m=modes[j]; if(m!="fake"&&m!="fakedsplit"&&m!="multisplit"&&m!="multidisorder") { add_unsupported("unsupported desync mode:" m); continue } if(m=="fake") { na=split_csv(als[i],aa); for(tmp=1;tmp<=na;tmp++) add_desync(m,aa[tmp],g) } else add_desync(m,"",g) }
		}
	}
	return group_out
}
function aliases_csv(g,k,    n,i,out) { n=blob_key_count[g SUBSEP k]; out=""; for(i=1;i<=n;i++) out=out (out?",":"") blob_key_alias[g SUBSEP k SUBSEP i]; return out }
function json_array(arr,n,    i,out) { out="["; for(i=1;i<=n;i++) out=out (i>1?",":"") "\"" jesc(arr[i]) "\""; return out "]" }
function canonical_req(arr,n,    i,out) { out=""; for(i=1;i<=n;i++) out=out (i>1?",":"") arr[i]; return out }
function process_command(line,    tok,nt,i,t,found,body,pos,k,v,rawv,g,n) {
	nt=tokenize(line,tok); found=0
	for(i=1;i<=nt;i++) { t=tolower(tok[i]); gsub(/\\/,"/",t); if(t ~ /winws\.exe$/) { found=i; break } }
	if(!found) return 0
	g=1; groups=1
	for(i=found+1;i<=nt;i++) {
		raw_args[++n_raw]=tok[i]
		if(tok[i]=="--new") { if(seq_count[g]>0) { g++; if(g>groups) groups=g } continue }
		if(substr(tok[i],1,2)!="--") { add_unsupported("token:" tok[i]); continue }
		body=substr(tok[i],3); pos=index(body,"="); if(!pos) { add_unsupported(tok[i]); continue }
		k=substr(body,1,pos-1); rawv=substr(body,pos+1)
		if((k=="filter-tcp"||k=="filter-udp") && (tolower(trim(rawv))=="%gamefiltertcp%"||tolower(trim(rawv))=="%gamefilterudp%")) group_game[g]=1
		v=resolve_value(rawv)
		if(!known_option(k)) { add_unsupported(tok[i]); continue }
		if(k=="wf-tcp") wf_tcp=v; else if(k=="wf-udp") wf_udp=v; else add_opt(g,k,v)
	}
	return 1
}
function tokenize(line,out,    i,ch,q,buf,n) {
	q=0; buf=""; n=0
	for(i=1;i<=length(line);i++) { ch=substr(line,i,1); if(ch=="\"") { q=!q; continue } if(ch ~ /[ \t]/ && !q) { if(buf!="") { out[++n]=buf; buf="" } } else buf=buf ch }
	if(q) { add_unsupported("unterminated quote in BAT command"); return n }
	if(buf!="") out[++n]=buf
	return n
}
BEGIN {
	if(pre_unsupported!="") add_unsupported(pre_unsupported)
	game_mode=(game_mode!=""?game_mode:"none"); game_tcp="12"; game_udp="12"; found_cmd=0; logical=""
}
{
	line=$0; sub(/\r$/, "", line); sub(/[ \t]+$/, "", line)
	if(logical=="" && (trim(line)=="" || line ~ /^[ \t]*::/)) next
	if(line ~ /\^$/) { sub(/\^$/, "", line); sub(/[ \t]+$/, "", line); logical=logical line " "; next }
	logical=logical line
	if(index(tolower(logical),"winws.exe")>0 && !found_cmd) found_cmd=process_command(trim(logical))
	logical=""
}
END {
	if(!found_cmd) { print "winws.exe command not found" > "/dev/stderr"; exit 2 }
	for(g=1;g<=groups;g++) {
		if(seq_count[g]<1) continue
		if(group_game[g] && game_mode=="none") { add_warning("Flowseal GameFilter-only branches omitted"); continue }
		c=convert_group(g); if(c!="") converted[++n_conv]=c
	}
	nfq=""; for(i=1;i<=n_alias;i++) { p=alias_order[i]; a=path_alias[p]; nfq=nfq (nfq?" ":"") "--blob=" a ":@" p }
	for(i=1;i<=n_conv;i++) nfq=nfq (nfq?" ":"") (i>1?"--new ":"") converted[i]
	tcp=normalize_ports(wf_tcp); udp=normalize_ports(wf_udp); compatible=(n_uns==0 && n_conv>0)?"true":"false"
	# Canonical input must match service::owz_profile_hash exactly.
	print "id=" profile_id > canon_file
	print "name=" profile_name >> canon_file
	print "source=flowseal" >> canon_file
	print "source_version=" source_version >> canon_file
	print "compatible=" compatible >> canon_file
	print "tcp_ports=" tcp >> canon_file
	print "udp_ports=" udp >> canon_file
	print "nfqws2=" nfq >> canon_file
	print "requirements.blobs=" canonical_req(req_blob,n_blob) >> canon_file
	print "requirements.hostlists=" canonical_req(req_host,n_host) >> canon_file
	print "requirements.ipsets=" canonical_req(req_ip,n_ip) >> canon_file
	for(i=1;i<=n_raw;i++) print raw_args[i] > strategy_file
	# JSON with two placeholders replaced by the wrapper after hashing.
	print "{" > out_file
	print "  \"id\": \"" jesc(profile_id) "\"," >> out_file
	print "  \"name\": \"" jesc(profile_name) "\"," >> out_file
	print "  \"source\": \"flowseal\"," >> out_file
	print "  \"source_version\": \"" jesc(source_version) "\"," >> out_file
	print "  \"compatible\": " compatible "," >> out_file
	print "  \"tcp_ports\": \"" jesc(tcp) "\"," >> out_file
	print "  \"udp_ports\": \"" jesc(udp) "\"," >> out_file
	print "  \"nfqws2\": \"" jesc(nfq) "\"," >> out_file
	print "  \"requirements\": {" >> out_file
	print "    \"blobs\": " json_array(req_blob,n_blob) "," >> out_file
	print "    \"hostlists\": " json_array(req_host,n_host) "," >> out_file
	print "    \"ipsets\": " json_array(req_ip,n_ip) >> out_file
	print "  }," >> out_file
	print "  \"content_hash\": \"sha256:__CONTENT_HASH__\"," >> out_file
	print "  \"import\": {" >> out_file
	print "    \"format\": \"flowseal-winws-v1\"," >> out_file
	print "    \"original_file\": \"" jesc(original_file) "\"," >> out_file
	print "    \"game_filter_mode\": \"none\"," >> out_file
	print "    \"strategy_key\": \"" jesc(strategy_key) "\"," >> out_file
	print "    \"strategy_hash\": \"sha256:__STRATEGY_HASH__\"," >> out_file
	print "    \"warnings\": " json_array(warnings,n_warn) "," >> out_file
	print "    \"unsupported\": " json_array(unsupported,n_uns) >> out_file
	print "  }" >> out_file
	print "}" >> out_file
}
