const express =  require('express');
const expressWs =  require('express-ws');
const pty =  require('node-pty');
const WebSocket = require('ws');
const http =  require('http');

const host = 'localhost';
const port = 3000;

const app = express();
// const ws_app = expressWs(app);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

// app.ws('/terminal', (ws, req) => {
wss.on('connection', ws => {
    console.log('client connected');

    const terminal = create_terminal();

    terminal.on('data', data => {
        try {
            ws.send(data);
        }
        catch(ex) {
            console.log(ex);
        }
    });

    ws.on('message', msg => {
        terminal.write(msg);
    });

    ws.on('close', () => {
        console.log('client disconnected');
        try {
            terminal.kill();
        }
        catch(ex) {
            console.log(ex);
        }
    });
})

app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

server.listen(
    port,
    host,
    () =>
      console.log(
        `listening on ${server.address().address} ${server.address().port}...`,
      ),
  );