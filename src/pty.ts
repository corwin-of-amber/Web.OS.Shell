import {EventEmitter} from 'events';



class Pty extends EventEmitter {

    opts: PtyOptions
    lnbuf: number[];

    constructor() {
        super();
        this.opts = {mode: PtyMode.COOKED, echo: false};
        this.lnbuf = [];
    }

    termWrite(buf: Buffer | string) {
        if (typeof buf == 'string')
            buf = Buffer.from(buf, 'binary');

        switch (this.opts.mode) {
        case PtyMode.COOKED:
            this.cookedLineEdit(buf); break;
        default:
            this.emit('data', buf);
            if (this.opts.echo) this.emit('term:data', buf);
        }
    }

    setOpts(opts: PtyOptions) {
        console.log(opts);
        if (opts.mode !== this.opts.mode) {
            this.cookedFlush();
        }
        this.opts = opts;
    }

    setFlags(flags: number[]) {
        var opts = {
            mode: (flags[TcFlags.L] & PtyLflags.ICANON) ? PtyMode.COOKED : PtyMode.RAW,
            echo: !!(flags[TcFlags.L] & PtyLflags.ECHO)
        };
        this.setOpts(opts);
    }

    cookedLineEdit(data) {
        let write = (d) => this.emit('term:data', d),
            writeStr = (s) => write(Buffer.from(s)),
            writeUInt8 = (c) => write(Buffer.from([c]));

        for (let i = 0; i < data.length; ++i) {
            let c = data[i];
            switch (c) {
            case 0x04:
                this.emit('eof');
                break;
            case 0x7f: case 0x08:
                if (this.lnbuf.length > 0) {
                    var ndel = this.lnbuf.pop() == 0x1B ? 2 : 1;
                    writeStr("\x08".repeat(ndel) + "\x1B[K"); 
                }
                break;
            case 0x0D:
                this.lnbuf.push(0x0A);
                this.cookedFlush();
                writeStr("\r\n"); break;
            case 0x1B:   // ^[, ESC
                this.lnbuf.push(c);
                writeStr("^["); break;
            case 0x15:   // ^U
                this.lnbuf = [];
                writeStr("\r\x1B[K"); break;
            default:
                this.lnbuf.push(c);
                writeUInt8(c);
            }
        }
    }

    cookedFlush() {
        if (this.lnbuf.length > 0) {
            this.emit('data', Buffer.from(this.lnbuf));
            this.lnbuf = [];
        }
    }
}

enum PtyMode { RAW, COOKED };

type PtyOptions = { mode: PtyMode; echo: boolean; };

enum TcFlags {
    I = 0,  /* tc_iflags - input flags */
    O = 1,  /* tc_oflags - output flags */
    C = 2,  /* tc_cflags - control flags */
    L = 3   /* tc_lflags - local flags */
};

enum PtyLflags {
    ISIG    = 0o0001,
    ICANON  = 0o0002,
    ECHO    = 0o0010,
    ECHOE   = 0o0020,
    ECHONL  = 0o0100,
    NOFLSH  = 0o0200,
    TOSTOP  = 0o0400
};

export {Pty, PtyMode, PtyOptions}
