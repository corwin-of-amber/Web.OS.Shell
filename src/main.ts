// build with
// parcel watch --hmr-hostname=localhost --public-url '.' src/index.html &
import $ from 'jquery';
import { Terminal } from 'xterm';

import { TtyShell } from './shell';



async function fetchBinary(url: string) {
    return new Uint8Array(
        await (await fetch(url)).arrayBuffer()
    );
}


function main() {
    $(() => {
        var term = new Terminal({cols: 60, rows: 19, allowTransparency: true,
        theme: {background: 'rgba(0,0,0,0.1)'}});
        term.setOption("convertEol", true)
        term.open(document.getElementById('terminal'));
        term.write(`\nStarting \x1B[1;3;31mdash\x1B[0m \n\n`)
        term.focus();

        var shell = new TtyShell();
        shell.attach(term);

        Object.assign(shell.files, {
            '/bin/ocamlrun': '#!/bin/ocamlrun.wasm',
            '/bin/ocaml':    '#!/bin/ocamlrun.wasm /bin/ocaml.byte',
            '/bin/fm':       '#!/bin/fileman.wasm'
        });
        (async () => {
            shell.files['/bin/ocaml.byte'] = await fetchBinary('/bin/ocaml');
            shell.files['/home/stdlib.cmi'] = await fetchBinary('/bin/ocaml_stdlib.cmi');
        })();
        shell.start();

        Object.assign(window, {term, shell, dash: shell.mainProcess});
    });
}

Object.assign(window, {main});
