"""HDR robustness test for Daman Duo.
Boots the desktop (post-processing) path in headless Chrome, puts one over-range pixel source and one NaN source in view
(window.__TEST.hdr) and fails if either blacks out more than 1% of the frame. Guards against the bloom black-rectangle bug.
Usage: python3 tools/hdr_test.py
"""
import asyncio, sys, os, json, threading, http.server, socketserver, functools

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 640, 'height': 360})
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{port}/dist/index.html?test=1&quality=high&upscale=native')
        await pg.wait_for_function('window.__TEST && window.__TEST.ready', timeout=600000)
        r = await pg.evaluate('window.__TEST.hdr()')
        await b.close()
    print('hdr test:', json.dumps(r))
    bad = []
    if not r.get('post'): bad.append('the post-processing path is not active on the High preset')
    for k in ('base', 'overRange', 'nan', 'after'):
        if r.get(k, 1) > 0.01: bad.append(f'{k}: {r.get(k)} of the frame is black')
    if errors: bad.append('page errors: ' + '; '.join(errors[:3]))
    if bad:
        print('HDR TEST FAILED'); [print('  -', x) for x in bad]; sys.exit(1)
    print('HDR TEST PASSED')


asyncio.run(main())
