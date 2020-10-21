import Debug from 'debug';

const debug = Debug('pigpio-ir:Signal');

export interface SignalOptions {
    tolerance?: number;
    minimumSignals?: number;
    numberOfMatchingSignalsByLength?: number;
}

export const DEFAULT_OPTIONS: Required<SignalOptions> = {
    tolerance: 0.1,
    minimumSignals: 3,
    numberOfMatchingSignalsByLength: 3,
};

export class Signal {
    private readonly _options: Required<SignalOptions>;
    private signals: number[][] = [];
    private _results: number[] | undefined;

    constructor(options: SignalOptions) {
        this._options = { ...DEFAULT_OPTIONS, ...options };
    }

    appendSignal(signal: number[]): void {
        this._results = undefined;
        this.signals.push(signal.slice());
    }

    private computeResults(): number[] {
        if (this._results) {
            return this._results;
        }

        if (this.signals.length < this._options.minimumSignals) {
            throw new Error(`required ${this._options.minimumSignals} signals, found ${this.signals.length}`);
        }

        const maxMatchingSignalsByLengths = this.getMaxMatchingSignalsByLengths();
        if (maxMatchingSignalsByLengths.length < this._options.numberOfMatchingSignalsByLength) {
            throw new Error(
                `required ${this._options.numberOfMatchingSignalsByLength} matching signals by length, found ${maxMatchingSignalsByLengths.length}`,
            );
        }

        debug(`found ${maxMatchingSignalsByLengths.length} matched length signals`);
        const averageSignal = Signal.computeAverage(maxMatchingSignalsByLengths);

        for (const matchingSignal of maxMatchingSignalsByLengths) {
            for (let i = 0; i < matchingSignal.length; i++) {
                const diff = (matchingSignal[i] - averageSignal[i]) / averageSignal[i];
                if (Math.abs(diff) > this._options.tolerance) {
                    throw new Error(`signal mismatch - ${(diff * 100).toFixed(1)}% (index: ${i})`);
                }
            }
        }

        debug(`valid signal ${averageSignal.join(',')}`);
        this._results = averageSignal;
        return this._results;
    }

    get isComplete(): boolean {
        try {
            this.computeResults();
            return true;
        } catch (err) {
            debug(`results incomplete ${err.message}`);
            return false;
        }
    }

    get result(): number[] {
        return this.computeResults();
    }

    private getMaxMatchingSignalsByLengths(): number[][] {
        const signalCountsByLength: { [len: string]: number[][] } = {};
        for (const signal of this.signals) {
            const len = `${signal.length}`;
            if (!(len in signalCountsByLength)) {
                signalCountsByLength[len] = [];
            }
            signalCountsByLength[len].push(signal);
        }

        let maxLength = 0;
        let maxKey: string | undefined = undefined;
        for (const key of Object.keys(signalCountsByLength)) {
            if (signalCountsByLength[key].length > maxLength) {
                maxLength = signalCountsByLength[key].length;
                maxKey = key;
            }
        }
        if (!maxKey) {
            throw new Error('invalid state');
        }
        return signalCountsByLength[maxKey];
    }

    private static computeAverage(signals: number[][]) {
        const ret: number[] = [];
        for (let i = 0; i < signals[0].length; i++) {
            let sum = 0;
            for (const s of signals) {
                sum += s[i];
            }
            ret.push(Math.round(sum / signals.length));
        }
        return ret;
    }
}
