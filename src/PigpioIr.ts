import { AhoCorasick, AhoCorasickButton, AhoCorasickOptions } from './AhoCorasick';
import fs from 'fs';
import { Button, PigpioIrFile, Remote } from './PigpioIrFile';
import pigpio from 'pigpio';
import { PigpioTransmit } from './PigpioTransmit';
import events from 'events';
import Debug from 'debug';

const debug = Debug('pigpio-ir:PigpioIr');

const PIN_NOT_SET = -1;
const CARRIER_FREQUENCY = 38000;
const TIME_BETWEEN_TRANSMITS_MS = 100;

export enum PullUpDown {
    UP = 'UP',
    DOWN = 'DOWN',
    OFF = 'OFF',
}

interface PigpioIrOptions extends AhoCorasickOptions {
    remotes: { [name: string]: Remote };
    outputPin?: number;
    outputPinFlip?: boolean;
    inputPin?: number;
    inputPullUpDown?: PullUpDown;
}

export interface PigpioIrFileOptions extends AhoCorasickOptions {
    create?: boolean;
    outputPin?: number;
    outputPinFlip?: boolean;
    inputPin?: number;
    inputPullUpDown?: PullUpDown;
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
        outputPinFlip: false,
        inputPin: PIN_NOT_SET,
        inputPullUpDown: PullUpDown.OFF,
    };
    public static readonly DEFAULT_FILE_OPTIONS: Required<PigpioIrFileOptions> = {
        ...AhoCorasick.DEFAULT_OPTIONS,
        create: true,
        outputPin: PIN_NOT_SET,
        outputPinFlip: false,
        inputPin: PIN_NOT_SET,
        inputPullUpDown: PullUpDown.OFF,
    };
    private _options: Required<PigpioIrOptions>;
    private ahoCorasick: AhoCorasick;
    private inputGpio: pigpio.Gpio | undefined;
    private outputGpio: pigpio.Gpio | undefined;
    private outputPin: number | undefined;
    private listenFn?: (level: number, tick: number) => void;
    private lastButtonReceived: { time: number; remoteName: string; buttonName: string } | undefined;

    private constructor(options: PigpioIrOptions) {
        super();
        this._options = { ...PigpioIr.DEFAULT_OPTIONS, ...options };
        if (!Object.values(PullUpDown).includes(this._options.inputPullUpDown)) {
            throw new Error(
                `Invalid inputPullUpDown value. Expected one of "${Object.values(PullUpDown).join(', ')}", found "${
                    this._options.inputPullUpDown
                }"`,
            );
        }
        this.ahoCorasick = new AhoCorasick(
            PigpioIr.fileButtonsToAhoCorasickButtons(this._options.remotes),
            this._options,
        );
        if (process.env.NODE_ENV === 'development') {
            debug('NODE_ENV set to development, skipping GPIO initialization');
        } else {
            if (this._options.outputPin !== PIN_NOT_SET) {
                this.outputPin = this._options.outputPin;
                debug(`output pin ${this._options.inputPin} (flip: ${this._options.outputPinFlip ? 'true' : 'false'})`);
                this.outputGpio = new pigpio.Gpio(this._options.outputPin, {
                    mode: pigpio.Gpio.OUTPUT,
                });
                this.outputGpio.digitalWrite(this._options.outputPinFlip ? 1 : 0);
            }
            if (this._options.inputPin !== PIN_NOT_SET) {
                const pullUpDown = toPigpioPullUpDown(this._options.inputPullUpDown);
                debug(
                    `input pin ${this._options.inputPin} (pullUpDown: ${this._options.inputPullUpDown} - ${pullUpDown})`,
                );
                this.inputGpio = new pigpio.Gpio(this._options.inputPin, {
                    mode: pigpio.Gpio.INPUT,
                    pullUpDown: pullUpDown,
                });
            }
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

    public async readSignal(options: { maxPulse: number; timeout: number }): Promise<number[]> {
        if (!this.inputGpio) {
            throw new Error('input pin not defined');
        }
        const gpio: pigpio.Gpio = this.inputGpio;

        let myResolve: ((signal: number[]) => void) | undefined;
        const signal: number[] = [];
        let startTime: number | null = null;
        let lastTick: number | null = null;
        const alertFn = (level: number, tick: number) => {
            if (lastTick !== null) {
                const delta = tick - lastTick;
                if (delta > options.maxPulse) {
                    complete();
                    return;
                }
                signal.push(delta);
            }
            if (startTime === null) {
                setTimeout(complete, options.timeout);
                lastTick = startTime = tick;
            }
            lastTick = tick;
        };

        const complete = () => {
            if (!myResolve) {
                return;
            }
            startTime = null;
            debug(`signal received: ${signal}`);
            myResolve(signal);
            myResolve = undefined;
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
        options: {
            remoteName: string;
            buttonName: string;
            signal: number[];
            debounce?: number;
        },
    ): Promise<void> {
        const fileContents: PigpioIrFile = await this.readFile(file, {
            create: true,
        });
        if (!fileContents.remotes[options.remoteName]) {
            fileContents.remotes[options.remoteName] = { buttons: {} };
        }
        const remote: Remote = fileContents.remotes[options.remoteName];
        remote.buttons[options.buttonName] = {
            signal: options.signal.join(','),
            debounce: options.debounce,
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
        if (process.env.NODE_ENV === 'development') {
            debug(`skipping transmit, NODE_ENV set to development`);
            return;
        }

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

        debug(`transmitting ${remoteName}:${buttonName}`);
        return PigpioTransmit.transmit(
            this.outputPin,
            this.outputGpio,
            this._options.outputPinFlip,
            PigpioIr.parseSignal(button.signal),
            reqOptions.timeout,
            CARRIER_FREQUENCY,
            TIME_BETWEEN_TRANSMITS_MS,
        );
    }

    public get started(): boolean {
        return !!this.listenFn;
    }

    public start(): void {
        if (this.listenFn) {
            throw new Error('listening already started');
        }
        if (process.env.NODE_ENV === 'development') {
            debug(`skipping start, NODE_ENV set to development`);
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            this.listenFn = () => {};
            return;
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
                    debug(`received ${found.remoteName}:${found.buttonName}`);
                    const button = this._options?.remotes[found.remoteName]?.buttons[found.buttonName];
                    if (
                        this.lastButtonReceived &&
                        button?.debounce &&
                        this.lastButtonReceived.remoteName === found.remoteName &&
                        this.lastButtonReceived.buttonName === found.buttonName
                    ) {
                        const t = Date.now() - (this.lastButtonReceived.time || 0);
                        if (t < button.debounce) {
                            this.lastButtonReceived.time = Date.now();
                            return;
                        }
                    }
                    this.lastButtonReceived = {
                        time: Date.now(),
                        remoteName: found.remoteName,
                        buttonName: found.buttonName,
                    };
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

        debug(`starting`);
        gpio.on('alert', this.listenFn);
        gpio.enableAlert();
        debug(`started`);
    }

    public stop(): void {
        if (!this.listenFn) {
            throw new Error('listening not started');
        }

        if (!this.inputGpio) {
            throw new Error('input pin not defined');
        }
        const gpio: pigpio.Gpio = this.inputGpio;

        debug(`stopping`);
        gpio.disableAlert();
        gpio.off('alert', this.listenFn);
        debug(`stopped`);
    }
}

function toPigpioPullUpDown(inputPullUpDown: PullUpDown): number {
    switch (inputPullUpDown) {
        case PullUpDown.DOWN:
            return pigpio.Gpio.PUD_DOWN;
        case PullUpDown.UP:
            return pigpio.Gpio.PUD_UP;
        default:
            return pigpio.Gpio.PUD_OFF;
    }
}
