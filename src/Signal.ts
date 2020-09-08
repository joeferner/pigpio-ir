export interface SignalOptions {
    tolerance?: number;
}

export const DEFAULT_OPTIONS: Required<SignalOptions> = {
    tolerance: 0.1,
};

export class Signal {
    private readonly _options: Required<SignalOptions>;
    private signals: number[][] = [];

    constructor(options: SignalOptions) {
        this._options = { ...DEFAULT_OPTIONS, ...options };
    }

    appendSignal(signal: number[]): void {
        if (this.signals.length > 0) {
            const currentResult = this.result;
            if (signal.length !== currentResult.length) {
                throw new Error('signal mismatch - length');
            }
            for (let i = 0; i < currentResult.length; i++) {
                const diff = (signal[i] - currentResult[i]) / currentResult[i];
                if (Math.abs(diff) > this._options.tolerance) {
                    throw new Error(`signal mismatch - ${(diff * 100).toFixed(1)}% (index: ${i})`);
                }
            }
        }
        this.signals.push(signal.slice());
    }

    get result(): number[] {
        if (this.signals.length === 0) {
            return [];
        }
        const ret: number[] = [];
        for (let i = 0; i < this.signals[0].length; i++) {
            let sum = 0;
            for (const s of this.signals) {
                sum += s[i];
            }
            ret.push(Math.round(sum / this.signals.length));
        }
        return ret;
    }
}
