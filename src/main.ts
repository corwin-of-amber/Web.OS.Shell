// build with
// parcel watch --hmr-hostname=localhost --public-url '.' src/index.html &
import $ from 'jquery';
import { Terminal } from 'xterm';

import { TtyShell } from './shell';
import { Resource, ResourceBundle } from './package-mgr';



function main() {
    $(async () => {
        var term = new Terminal({cols: 80, rows: 25, allowTransparency: true,
        theme: {background: 'rgba(0,0,0,0.1)'}});
        term.setOption("convertEol", true)
        term.open(document.getElementById('terminal'));
        term.write(`\nStarting \x1B[1;3;31mdash\x1B[0m \n\n`)
        term.focus();

        var shell = new TtyShell();
        shell.env['PYTHONHOME'] = '/bin';
        shell.env['max_print_line'] = '1000'; // for latex
        shell.attach(term);

        const ocaml = '/usr/local/lib/ocaml';
        const coq = '/usr/local/lib/coq';
        const tex = '/usr/local/tex';

        var baseSys = {
            '/bin/ls':               '#!/bin/coreutils/ls.wasm',
            '/bin/touch':            '#!/bin/coreutils/touch.wasm',
            '/bin/cat':              '#!/bin/coreutils/cat.wasm',
            '/bin/cut':              '#!/bin/coreutils/cut.wasm',
            '/bin/env':              '#!/bin/coreutils/env.wasm',
            '/bin/cksum':            '#!/bin/coreutils/cksum.wasm',
            '/bin/mkdir':            '#!/bin/coreutils/mkdir.wasm',
            '/bin/rm':               '#!/bin/coreutils/rm.wasm',
            '/bin/date':             '#!/bin/coreutils/date.wasm',

            '/bin/grep':             '#!/bin/grep.wasm',
            '/bin/make':             '#!/bin/make.wasm',

            '/bin/nano':             '#!/bin/nano.wasm',

            '/bin/fm':               '#!/bin/fileman.wasm',

            '/bin/python':           '#!/bin/python.wasm',
            '/bin/micropython':      '#!/bin/micropython.wasm',

            //'/bin/lib/python3.9/':   new Resource('/bin/python.zip'),
/*
            '/bin/tex':              '#!/bin/tex/tex.wasm',
            */
            '/bin/pdftex':           '#!/bin/tex/pdftex.wasm',
            '/bin/pdflatex':         '#!/bin/tex/pdftex.wasm',
            '/bin/texmf.cnf':        new Resource('/bin/tex/texmf.cnf'),
            [`${tex}/dist/`]:        new Resource('/bin/tex/dist.tar'),
            [`${tex}/tldist/`]:      new Resource('/bin/tex/tldist.tar'),

            '/bin/ocamlrun':         '#!/bin/ocaml/ocamlrun.wasm',
            '/bin/ocaml':            `#!/bin/ocaml/ocamlrun.wasm ${ocaml}/ocaml`,
            '/bin/ocamlc':           `#!/bin/ocaml/ocamlrun.wasm ${ocaml}/ocamlc`,
            [`${ocaml}/camlheader`]: '#!/bin/ocaml/ocamlrun.wasm\n',
            //[ocaml]:                 new Resource('/bin/ocaml/base.zip'),
/*
            '/bin/coqtop':           `#!/bin/ocaml/ocamlrun.wasm ${coq}coqtop.byte`,
            [`${coq}/coqtop.byte`]:  new Resource('/bin/coq/coqtop.byte'),
            [`${coq}/`]:             new Resource('/bin/coq/dist.zip'),
*/
            '/bin/z3':               '#!/bin/z3.wasm',
            '/bin/llc':              '#!/bin/llc.wasm',

            // Sample program
            '/home/a.ml':          'let re = Str.regexp ".*"\nlet _ = print_int @@ 4 + 5;\n  print_string "\\n"\n',
                                   // doesn't work yet: 'let re = Str.regexp ".*"\nlet _ = if Str.string_match re "hello" 0 then print_int @@ 4 + 5;\nprint_string "\\n"\n',
            '/home/Makefile':      'hello: a.cmo\n\tocamlc str.cma $^ -o $@\na.cmo: a.ml\n\tocamlc -c $^ -o $@\n',
            '/home/a.py':          'print(list(5 * x + y for x in range(10) for y in [4, 2, 1]))\n',

            '/home/ebi.ml':        `let _ =
                                    let n = Big_int.big_int_of_string "4378927483923" in
                                    Format.printf "%s\n%!" (Big_int.string_of_big_int n);
                                    let m = Big_int.big_int_of_string "69236109238" in
        
                                    Format.printf "%s\n%!" (Big_int.string_of_big_int (Big_int.mult_big_int n m))
                                    `,

            //'/home/ebi.byte':      new Resource('/bin/ocaml/example_big_int.byte'),

            '/home/doc.tex':       '\\medskip \n\nhello $x^2$ \n\n \\bye\n',
            '/home/ldoc.tex':      '\\documentclass{article}\\usepackage[T1]{fontenc}\\begin{document}hello $x^7$\\end{document}\n',
            '/home/ol.tex':        new Resource('/bin/tex/examples/overleaf-scientific-writing-exercise.tex'),
            //'/home/arrows.tex':    new Resource('/bin/tex/sample-tikz.tex')
            
            '/home/hello.ll':      'define i32 @main() { entry: ret i32 0 }',
        };
        
        // await fakeInstall(shell, baseSys);

        shell.start();

        shell.packageManager.install(baseSys);

        Object.assign(window, {term, shell, dash: shell.mainProcess});
    });
}

/**
 * Use this to install without sharing a volume.
 * (must finish before shell.start().)
 */
async function fakeInstall(shell: TtyShell, bundle: ResourceBundle) {
    for (let kv of Object.entries(bundle)) {
        let [fn, content] = kv;
        if (typeof content == 'string')
            shell.files[fn] = content;
        else if (content instanceof Resource)
            shell.files[fn] = await content.fetch();
    }
}



Object.assign(window, {main});
