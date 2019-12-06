// build with
// parcel watch --hmr-hostname=localhost src/terminal.ts
import { EventEmitter } from 'events';
import $ from 'jquery';
import { Terminal } from 'xterm';

import { Process } from 'wasi-kernel/src/kernel';
import { WorkerPool, ProcessLoader } from 'wasi-kernel/src/kernel/services/worker-pool';

import { Pty } from './pty';



class Shell extends EventEmitter implements ProcessLoader {

    workerScript: string
    mainProcess: Process
    pool: WorkerPool

    constructor() {
        super();
        this.workerScript = '../node_modules/wasi-kernel/dist/worker.js';
        this.pool = new WorkerPool(this.workerScript);
        this.pool.loader = this;
        this.pool.on('worker:data', (_, x) => this.emit('data', x));
    }

    start() {
        this.mainProcess = this.spawn('dash', ['dash']).process;
    }

    spawn(prog: string, argv: string[], env?: {}) {
        var wasm: string;
        switch (argv[0] || prog) {
        case "dash":  wasm = '/dash.wasm'; break;
        case "ls":    wasm = '/bin/ls.wasm'; break;
        case "cat":
        case "mkdir":
        case "touch":  wasm = '../busy.wasm'; break;
        default:
            wasm = prog;
        }

        var p = this.pool.spawn(wasm, argv, env);
        p.promise
            .then((ev: {code:number}) => console.log(`${name} - exit ${ev.code}`))
            .catch((e: Error) => console.error(`${name} - error;`, e));

        return p;
    }

    write(data: string | Uint8Array) {
        if (typeof data === 'string')
            data = Buffer.from(data);
        for (let i = 0; i < Buffer.length; i++)  // ugh
            if (data[i] == 13) data[i] = 10;
        this.mainProcess.stdin.write(data);
    }
}



$(() => {
    var term = new Terminal({cols: 60, rows: 19});
    term.setOption("convertEol", true)
    term.open(document.getElementById('terminal'));
    term.write(`\nStarting \x1B[1;3;31mdash\x1B[0m \n\n`)
    term.focus();

    var pty = new Pty;
    term.onData((x: string) => pty.termWrite(Buffer.from(x, 'binary')));
    pty.on('term:data', (x: Buffer) => term.write(x));

    var shell = new Shell();
    pty.on('data', (x: Buffer) => shell.write(x))
    shell.on('data', (x: string) => term.write(x))
    shell.start();

    Object.assign(window, {term, shell, dash: shell.mainProcess});
});

Object.assign(window, {Terminal});
