import {AhoCorasick, AhoCorasickButton, AhoCorasickOptions} from "./AhoCorasick";
import fs from "fs";
import {PigpioIrFile, Remote} from "./PigpioIrFile";
import pigpio from "pigpio";

interface PigpioIrOptions extends AhoCorasickOptions {
    remotes: { [name: string]: Remote };
    pin: number;
}

export interface PigpioIrFileOptions extends AhoCorasickOptions {
    create?: boolean;
    pin: number;
}

export class PigpioIr {
    private static readonly DEFAULT_OPTIONS: Required<PigpioIrOptions> = {
        ...AhoCorasick.DEFAULT_OPTIONS,
        remotes: {},
        pin: -1
    };
    public static readonly DEFAULT_FILE_OPTIONS: Required<PigpioIrFileOptions> = {
        ...AhoCorasick.DEFAULT_OPTIONS,
        create: true,
        pin: -1
    };
    private options: Required<PigpioIrOptions>;
    private ahoCorasick: AhoCorasick;
    private inputGpio: pigpio.Gpio;

    private constructor(options: PigpioIrOptions) {
        this.options = {...PigpioIr.DEFAULT_OPTIONS, ...options};
        this.ahoCorasick = new AhoCorasick(
            PigpioIr.fileButtonsToAhoCorasickButtons(this.options.remotes),
            this.options
        );
        this.inputGpio = new pigpio.Gpio(this.options.pin, {mode: pigpio.Gpio.INPUT});
    }

    private static fileButtonsToAhoCorasickButtons(remotes: { [remoteName: string]: Remote }) {
        const ahoCorasickButtons: AhoCorasickButton[] = [];
        for (const remoteName of Object.keys(remotes)) {
            const remote = remotes[remoteName];
            if (!remote.buttons) {
                throw new Error(`Invalid remote '${remoteName}'`);
            }
            for (const buttonName of Object.keys(remote.buttons)) {
                const button = remote.buttons[buttonName];
                if (!button.signal) {
                    throw new Error(`Invalid remote button '${buttonName}' on remote '${remoteName}'`);
                }
                ahoCorasickButtons.push({
                    remoteName,
                    buttonName,
                    signal: button.signal.split(',').map(n => parseFloat(n))
                })
            }
        }
        return ahoCorasickButtons;
    }

    static async fromFile(file: string, options: PigpioIrFileOptions): Promise<PigpioIr> {
        const reqOptions: Required<PigpioIrFileOptions> = {...PigpioIr.DEFAULT_FILE_OPTIONS, ...options};
        const fileContents: PigpioIrFile = await PigpioIr.readFile(file, {create: reqOptions.create});
        return new PigpioIr({...reqOptions, ...fileContents});
    }

    readSignal(timeout: number): Promise<number[]> {
        return new Promise<number[]>((resolve, reject) => {
            const signal: number[] = [];
            let startTime: number | null = null;
            let lastTick: number | null = null;
            this.inputGpio.on('alert', (level, tick) => {
                if (lastTick !== null) {
                    signal.push(tick - lastTick);
                }
                if (startTime === null) {
                    setTimeout(() => {
                        startTime = null;
                        resolve(signal);
                    }, timeout);
                    lastTick = startTime = tick;
                }
                lastTick = tick;
            });

            this.inputGpio.enableAlert();
        }).finally(() => {
            this.inputGpio.disableAlert();
        });
    }

    static async setButtonInFile(file: string, remoteName: string, buttonName: string, signal: number[]): Promise<void> {
        const fileContents: PigpioIrFile = await this.readFile(file, {create: true});
        if (!fileContents.remotes[remoteName]) {
            fileContents.remotes[remoteName] = {buttons: {}};
        }
        const remote: Remote = fileContents.remotes[remoteName];
        remote.buttons[buttonName] = {
            signal: signal.join(',')
        };
        await fs.promises.writeFile(file, JSON.stringify(fileContents, null, 2) + '\n', 'utf8');
    }

    private static async readFile(file: string, options: { create: boolean }): Promise<PigpioIrFile> {
        try {
            const fileContents = await fs.promises.readFile(file, "utf8");
            return JSON.parse(fileContents) as PigpioIrFile;
        } catch (err) {
            if (options.create && err.code === 'ENOENT') {
                return {
                    remotes: {}
                };
            }
            throw err;
        }
    }
}
