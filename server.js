const express = require('express');
const pty = require('node-pty');
const http = require('http');
const WebSocket = require('ws');
const e = require('express');

const host = '0.0.0.0';
const port = 3000;

const app = express();

const http_server = http.createServer(app);

const ws_server = new WebSocket.Server({
    noServer: true,
    maxPayload: 2 * 1024 // restrict clients max msg size
});

const ws_route = '/terminal/';

const ws_allow_origins = [
    'http://localhost',
    'http://127.0.0.1',
    'http://dockers.gcp.vpn'
];

// i think its sliding window rate limit
function rate_limiter(req_limit, time_window) {
    const check_time = 500;
    let checker = null;
    let count = 0;
    let exceeded = false;

    // recalc req limit with check_time in mind
    req_limit = req_limit / time_window * check_time;

    return function () {
        const on_timeout = _ => {
            count -= req_limit;
            count = Math.max(count, 0);
            checker = null;

            if (count > 0)
                checker = setTimeout(on_timeout, check_time);
        };

        if (!checker)
            checker = setTimeout(on_timeout, check_time);

        ++count;

        if (count > req_limit)
            exceeded = true;

        return exceeded;
    };
}

// string message buffering
function buffered(socket, timeout) {
    let data = '';
    let sender = null;

    return (chunk) => {
        data += chunk;

        if (!sender)
            sender = setTimeout(() => {
                const msg = { type: 'm', data };

                try {
                    socket.send(JSON.stringify(msg));
                }
                catch (ex) {
                    console.log(ex);
                }

                data = '';
                sender = null;
            }, timeout);
    };
}

function verify_client(req) {
    if (req.url == ws_route && ws_allow_origins.includes(req.headers.origin))
        return true;

    return false;
}

function create_terminal() {
    const env = Object.assign({}, process.env);
    env['COLORTERM'] = 'truecolor';

    const terminal = pty.spawn('bash', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: env.PWD,
        env: env,
        encoding: 'utf8'
    });

    return terminal;
}

function parse_msg(raw_msg, terminal) {
    const msg = JSON.parse(raw_msg);

    switch (msg.type) {
        case 'm':
            terminal.write(msg.data);
            break;
        case 'f':
            // limit minimum size for terminal
            let rows = Math.max(msg.rows, 1); // crash when 0 :)
            let cols = Math.max(msg.cols, 1); // crash when 0 :)
            terminal.resize(cols, rows);
            break;
    }
}

http_server.on('upgrade', function upgrade(request, socket, head) {
    if (!verify_client(request)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }

    ws_server.handleUpgrade(request, socket, head, function done(ws) {
        ws_server.emit('connection', ws, request);
    });
});

ws_server.on('connection', (ws, req) => {
    let terminal_exited = false;
    const rate_limit = rate_limiter(38, 1000);
    const send = buffered(ws, 10);

    console.log('client connected');

    try {
        var terminal = create_terminal();
    }
    catch (e) {
        console.error(e.stack);
        ws.close();
        return;
    }

    terminal.on('data', data => {
        try {
            send(data);
        }
        catch (ex) {
            console.log(ex);
        }
    });

    const exit = terminal.onExit(() => {
        terminal_exited = true;
        ws.close();
    })

    ws.on('message', raw_msg => {
        const exceeded = rate_limit();

        if (exceeded) {
            console.log(ws._socket.remoteAddress, 'Rate limit exceeded');
            ws.close();
            return;
        }

        try {
            parse_msg(raw_msg, terminal);
        }
        catch (ex) {
            console.log(ex);
        }
    });

    ws.on('error', error => {
        console.log(ws._socket.remoteAddress, error.message);
    });

    ws.on('close', () => {
        console.log('client disconnected');
        try {
            terminal.removeAllListeners('data');
            exit.dispose();

            if (!terminal_exited)
                terminal.onExit(() => {
                    console.log('terminal killed');
                    // calling kill() under heavy load outside onExit leads to crash on win
                    terminal.kill();
                })

            // closes data flow to system ( calling kill() instead crashes on win under heave load)
            terminal.end();
        }
        catch (ex) {
            console.log(ex);
        }
    });
});

ws_server.on('error', error => {
    console.log(error);
});

app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

http_server.listen(
    port,
    host,
    () =>
        console.log(
            `listening on ${http_server.address().address} ${http_server.address().port}...`,
        ),
);

const fs = require('fs');

process.on('uncaughtException', function (err) {
    fs.appendFileSync('uncaught.log', "\n" + err.stack);
    console.error(err);
});
