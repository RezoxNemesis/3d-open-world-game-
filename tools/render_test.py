"""Headless smoke + render test for Daman Duo.
Boots the built game (dist/index.html) in headless Chrome (software WebGL), runs the in-game test
scenarios exposed on window.__TEST, saves screenshots to test-out/ and fails on any JavaScript error.
Usage: python3 tools/render_test.py [--ci] [--only name1,name2] [--quality low|high|ultra]
"""
import asyncio, sys, os, json, time, threading, http.server, socketserver, functools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test-out')
os.makedirs(OUT, exist_ok=True)
args = sys.argv[1:]
CI = '--ci' in args
ONLY = None
QUALITY = 'low'
for i, a in enumerate(args):
    if a == '--only': ONLY = args[i + 1].split(',')
    if a == '--quality': QUALITY = args[i + 1]


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a: None
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd.server_address[1]


async def main():
    from playwright.async_api import async_playwright
    port = serve()
    chrome = next((p for p in ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'] if os.path.exists(p)), None)
    errors, logs = [], []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: errors.append(str(e)))
        t0 = time.time()
        await pg.goto(f'http://127.0.0.1:{port}/dist/index.html?test=1&quality={QUALITY}')
        try:
            await pg.wait_for_function('window.__TEST && window.__TEST.ready === true', timeout=420000, polling=1000)
        except Exception as e:
            errors.append('game did not become ready: ' + str(e))
        print(f'boot {time.time() - t0:.1f}s')
        names = []
        if not errors:
            names = await pg.evaluate('window.__TEST.scenarios')
            if ONLY: names = [n for n in names if n in ONLY]
        report = {}
        for n in names:
            try:
                r = await pg.evaluate(f'window.__TEST.run({json.dumps(n)})')
                await pg.screenshot(path=os.path.join(OUT, f'{n}.png'), timeout=240000)
                report[n] = r
                print('scenario', n, json.dumps(r)[:300])
            except Exception as e:
                errors.append(f'scenario {n}: {e}')
        stats = await pg.evaluate('window.__TEST ? window.__TEST.stats() : null') if not errors or names else None
        print('stats', json.dumps(stats))
        with open(os.path.join(OUT, 'report.json'), 'w') as f:
            json.dump({'scenarios': report, 'stats': stats, 'errors': errors, 'logs': logs[-200:]}, f, indent=1)
        await b.close()
    for l in logs[-60:]:
        if l.startswith('error') or l.startswith('warning') and 'GPU stall' not in l: print(l)
    if errors:
        print('ERRORS:'); [print(' -', e) for e in errors]
        if CI: sys.exit(1)
    print('render test passed' if not errors else 'render test had errors')

asyncio.run(main())
