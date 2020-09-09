import { AhoCorasick, AhoCorasickButton, AhoCorasickOptions } from './AhoCorasick';
import fs from 'fs';
import { Button, PigpioIrFile, Remote } from './PigpioIrFile';
import pigpio from 'pigpio';
import { PigpioTransmit } from './PigpioTransmit';
import events from 'events';

const PIN_NOT_SET = -1;
const CARRIER_FREQUENCY = 38000;

interface PigpioIrOptions extends AhoCorasickOptions {
    remotes: { [name: string]: Remote };
    outputPin?: number;
    inputPin?: number;
}

export interface PigpioIrFileOptions extends AhoCorasickOptions {
    create?: boolean;
    outputPin?: number;
    inputPin?: number;
}

export interface ButtonEventData {
    raw: AhoCorasickButton;
    remoteName: string;
    buttonName: string;
    button: Button;
}

export interface PigpioIrEvents {
    on(event: 'button', listener: (data: ButtonEventData) => void): this;
}

export class PigpioIr extends events.EventEmitter implements PigpioIrEvents {
    private static readonly DEFAULT_OPTIONS: Required<PigpioIrOptions> = {
        ...AhoCorasick.DEFAULT_OPTIONS,
        remotes: {},
        outputPin: PIN_NOT_SET,
        inputPin: PIN_NOT_SET,
    };
    public static readonly DEFAULT_FILE_OPTIONS: Required<PigpioIrFileOptions> = {
        ...AhoCorasick.DEFAULT_OPTIONS,
        create: true,
        outputPin: PIN_NOT_SET,
        inputPin: PIN_NOT_SET,
    };
    private _options: Required<PigpioIrOptions>;
    private ahoCorasick: AhoCorasick;
    private inputGpio: pigpio.Gpio | undefined;
    private outputGpio: pigpio.Gpio | undefined;
    private outputPin: number | undefined;
    private listenFn?: (level: number, tick: number) => void;

    private constructor(options: PigpioIrOptions) {
        super();
        this._options = { ...PigpioIr.DEFAULT_OPTIONS, ...options };
        this.ahoCorasick = new AhoCorasick(
            PigpioIr.fileButtonsToAhoCorasickButtons(this._options.remotes),
            this._options,
        );
        if (this._options.outputPin !== PIN_NOT_SET) {
            this.outputPin = this._options.outputPin;
            this.outputGpio = new pigpio.Gpio(this._options.outputPin, {
                mode: pigpio.Gpio.OUTPUT,
            });
        }
        if (this._options.inputPin !== PIN_NOT_SET) {
            this.inputGpio = new pigpio.Gpio(this._options.inputPin, {
                mode: pigpio.Gpio.INPUT,
            });
        }
    }

    public get options(): Required<PigpioIrOptions> {
        return this._options;
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
                    signal: PigpioIr.parseSignal(button.signal),
                });
            }
        }
        return ahoCorasickButtons;
    }

    private static parseSignal(signal: string): number[] {
        return signal.split(',').map((n) => parseFloat(n));
    }

    public static async fromFile(file: string, options: PigpioIrFileOptions): Promise<PigpioIr> {
        const reqOptions: Required<PigpioIrFileOptions> = {
            ...PigpioIr.DEFAULT_FILE_OPTIONS,
            ...options,
        };
        const fileContents: PigpioIrFile = await PigpioIr.readFile(file, {
            create: reqOptions.create,
        });
        return new PigpioIr({ ...reqOptions, ...fileContents });
    }

    public async readSignal(timeout: number): Promise<number[]> {
        if (!this.inputGpio) {
            throw new Error('input pin not defined');
        }
        const gpio: pigpio.Gpio = this.inputGpio;

        let myResolve: (signal: number[]) => void;
        const signal: number[] = [];
        let startTime: number | null = null;
        let lastTick: number | null = null;
        const alertFn = (level: number, tick: number) => {
            if (lastTick !== null) {
                signal.push(tick - lastTick);
            }
            if (startTime === null) {
                setTimeout(() => {
                    startTime = null;
                    myResolve(signal);
                }, timeout);
                lastTick = startTime = tick;
            }
            lastTick = tick;
        };

        return new Promise<number[]>((resolve) => {
            myResolve = resolve;
            gpio.on('alert', alertFn);
            gpio.enableAlert();
        }).finally(() => {
            gpio.disableAlert();
            gpio.off('alert', alertFn);
        });
    }

    static async setButtonInFile(
        file: string,
        remoteName: string,
        buttonName: string,
        signal: number[],
    ): Promise<void> {
        const fileContents: PigpioIrFile = await this.readFile(file, {
            create: true,
        });
        if (!fileContents.remotes[remoteName]) {
            fileContents.remotes[remoteName] = { buttons: {} };
        }
        const remote: Remote = fileContents.remotes[remoteName];
        remote.buttons[buttonName] = {
            signal: signal.join(','),
        };
        await fs.promises.writeFile(file, JSON.stringify(fileContents, null, 2) + '\n', 'utf8');
    }

    private static async readFile(file: string, options: { create: boolean }): Promise<PigpioIrFile> {
        try {
            const fileContents = await fs.promises.readFile(file, 'utf8');
            return JSON.parse(fileContents) as PigpioIrFile;
        } catch (err) {
            if (options.create && err.code === 'ENOENT') {
                return {
                    remotes: {},
                };
            }
            throw err;
        }
    }

    async transmit(remoteName: string, buttonName: string, options?: { timeout: number }): Promise<void> {
        const reqOptions = {
            timeout: 500,
            ...options,
        };

        if (!this.outputGpio || !this.outputPin) {
            throw new Error('output pin not defined');
        }

        const remote = this._options.remotes[remoteName];
        if (!remote) {
            throw new Error(`Could not find remote '${remoteName}'`);
        }
        const button = remote.buttons[buttonName];
        if (!button) {
            throw new Error(`Could not find button '${buttonName}' on remote '${remoteName}'`);
        }

        return PigpioTransmit.transmit(
            this.outputPin,
            this.outputGpio,
            PigpioIr.parseSignal(button.signal),
            reqOptions.timeout,
            CARRIER_FREQUENCY,
        );
    }

    public get started(): boolean {
        return !!this.listenFn;
    }

    public start(): void {
        if (this.listenFn) {
            throw new Error('listening already started');
        }
        if (!this.inputGpio) {
            throw new Error('input pin not defined');
        }
        const gpio: pigpio.Gpio = this.inputGpio;

        let lastTick: number | null = null;
        this.listenFn = (level: number, tick: number) => {
            if (lastTick !== null) {
                const found = this.ahoCorasick.appendFind(tick - lastTick);
                if (found) {
                    const button = this._options?.remotes[found.remoteName]?.buttons[found.buttonName];
                    this.emit('button', {
                        raw: found,
                        remoteName: found.remoteName,
                        buttonName: found.buttonName,
                        button,
                    });
                }
            }
            lastTick = tick;
        };

        gpio.on('alert', this.listenFn);
        gpio.enableAlert();
    }

    public stop(): void {
        if (!this.listenFn) {
            throw new Error('listening not started');
        }

        if (!this.inputGpio) {
            throw new Error('input pin not defined');
        }
        const gpio: pigpio.Gpio = this.inputGpio;

        gpio.disableAlert();
        gpio.off('alert', this.listenFn);
    }
}
