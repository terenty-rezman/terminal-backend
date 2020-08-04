const express = require('express');
const expressWs = require('express-ws');
const pty = require('node-pty');

const host = 'localhost';
const port = 3000;

const app = express();
const ws_app = expressWs(app);

function create_terminal() {
    const env = Object.assign({}, process.env);
    env['COLORTERM'] = 'truecolor';

    const terminal = pty.spawn('cmd.exe', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: env.PWD,
        env: env,
        encoding: 'utf8'
    });

    return terminal;
}

app.ws('/terminal', (ws, req) => {
    console.log('client connected');

    const terminal = create_terminal();

    terminal.on('data', data => {
        try {
            ws.send(data);
        }
        catch (ex) {
            console.log(ex);
        }
    });

    ws.on('message', msg => {
        terminal.write(msg);
    });

    ws.on('close', () => {
        console.log('client disconnected');
        try {
            terminal.removeAllListeners('data');
            terminal.onExit(() => {
                console.log('terminal killed');
                terminal.kill();
            })
            terminal.end();
        }
        catch (ex) {
            console.log(ex);
        }
    });
})

app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const server = app.listen(
    port,
    host,
    () =>
        console.log(
            `listening on ${server.address().address} ${server.address().port}...`,
        ),
);