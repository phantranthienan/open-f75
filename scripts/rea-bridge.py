"""Keeps one REA MCP server (and one Ghidra session) alive across shell commands.

Each `rea` CLI call re-imports the binary into Ghidra (minutes for a large
exe). This starts `rea mcp` once and relays tool calls to it over a Unix
socket, so one import answers many questions. Static analysis only: REA's
native tools read the binary and never run it.

  python3 -I scripts/rea-bridge.py serve SOCK LOG        start; run it in the background
  python3 -I scripts/rea-bridge.py list SOCK             tool names
  python3 -I scripts/rea-bridge.py props SOCK TOOL...    a tool's description and arguments
  python3 -I scripts/rea-bridge.py call SOCK TOOL JSON OUT   call one tool, save the raw reply
  python3 -I scripts/rea-bridge.py show OUT [CHARS]      print a saved reply's result
  python3 -I scripts/rea-bridge.py decompile SOCK ADDRESS OUT.c   save one function's pseudocode

serve needs GHIDRA_INSTALL_DIR set and `rea` (npm i -g rea-agents) on PATH.
Typical first calls: open_binary {"path": ABS, "provider_id": "ghidra"} (lazy),
then search_strings {"pattern": "...", "mode": "regex"}, trace_feature
{"query": "..."}, find_xrefs_to_name, procedure_pseudo_code, close_binary {}.
"""
import json
import os
import socket
import subprocess
import sys
import threading


def serve(sock_path, log_path):
    log = open(log_path, 'a', buffering=1)
    proc = subprocess.Popen(['rea', 'mcp'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=log, text=True, bufsize=1)
    pending = {}
    lock = threading.Lock()
    next_id = [0]

    def reader():
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except ValueError:
                log.write('non-json: ' + line[:200] + '\n')
                continue
            if msg.get('id') in pending:
                slot = pending.pop(msg['id'])
                slot['msg'] = msg
                slot['event'].set()
            else:
                log.write('notice: ' + line[:300] + '\n')

    threading.Thread(target=reader, daemon=True).start()

    def request(method, params):
        with lock:
            next_id[0] += 1
            rid = next_id[0]
        slot = {'event': threading.Event()}
        pending[rid] = slot
        proc.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': rid, 'method': method, 'params': params}) + '\n')
        proc.stdin.flush()
        slot['event'].wait()
        return slot['msg']

    init = request('initialize', {'protocolVersion': '2025-06-18', 'capabilities': {},
                                  'clientInfo': {'name': 'rea-bridge', 'version': '1'}})
    log.write('initialized: ' + json.dumps(init)[:300] + '\n')
    proc.stdin.write(json.dumps({'jsonrpc': '2.0', 'method': 'notifications/initialized'}) + '\n')
    proc.stdin.flush()

    if os.path.exists(sock_path):
        os.unlink(sock_path)
    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    srv.bind(sock_path)
    srv.listen(4)

    def handle(conn):
        data = b''
        while not data.endswith(b'\n'):
            chunk = conn.recv(65536)
            if not chunk:
                break
            data += chunk
        req = json.loads(data)
        reply = request(req['method'], req.get('params', {}))
        conn.sendall(json.dumps(reply).encode() + b'\n')
        conn.close()

    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


def send(sock_path, method, params):
    c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    c.connect(sock_path)
    c.sendall(json.dumps({'method': method, 'params': params}).encode() + b'\n')
    data = b''
    while not data.endswith(b'\n'):
        chunk = c.recv(1 << 20)
        if not chunk:
            break
        data += chunk
    return json.loads(data)


def result_of(reply):
    """The tool's normalized result: a string (pseudocode) or JSON data."""
    if reply.get('error'):
        return {'error': reply['error']}
    texts = [c.get('text', '') for c in reply.get('result', {}).get('content', [])]
    try:
        evidence = json.loads(texts[0])
    except (IndexError, ValueError):
        return '\n'.join(texts)
    return evidence.get('normalized_result', evidence.get('result', evidence))


def main(argv):
    cmd = argv[1]
    if cmd == 'serve':
        serve(argv[2], argv[3])
    elif cmd == 'list':
        for t in send(argv[2], 'tools/list', {})['result']['tools']:
            print(t['name'])
    elif cmd == 'props':
        for t in send(argv[2], 'tools/list', {})['result']['tools']:
            if t['name'] in argv[3:]:
                print('##', t['name'], '-', t.get('description', '')[:500])
                schema = t['inputSchema']
                for k, v in schema.get('properties', {}).items():
                    required = '(required)' if k in schema.get('required', []) else ''
                    print('  ', k, required, '-', v.get('description', '')[:160])
    elif cmd == 'call':
        reply = send(argv[2], 'tools/call', {'name': argv[3], 'arguments': json.loads(argv[4])})
        with open(argv[5], 'w') as f:
            json.dump(reply, f, indent=1)
        print('saved', argv[5], '; isError =', reply.get('result', {}).get('isError'), '; error =', reply.get('error'))
    elif cmd == 'show':
        with open(argv[2]) as f:
            result = result_of(json.load(f))
        limit = int(argv[3]) if len(argv) > 3 else 6000
        print((result if isinstance(result, str) else json.dumps(result, ensure_ascii=False))[:limit])
    elif cmd == 'decompile':
        reply = send(argv[2], 'tools/call', {'name': 'procedure_pseudo_code', 'arguments': {'procedure': argv[3]}})
        code = result_of(reply)
        with open(argv[4], 'w') as f:
            f.write(code if isinstance(code, str) else json.dumps(code, indent=1))
        print('saved', argv[4])
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv)
