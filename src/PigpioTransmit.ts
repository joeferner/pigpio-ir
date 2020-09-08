import pigpio, { GenericWaveStep } from 'pigpio';
import Timeout = NodeJS.Timeout;

const MICROS_PER_SECOND = 1 * 1000 * 1000;

export class PigpioTransmit {
    public static async transmit(
        pin: number,
        gpio: pigpio.Gpio,
        signal: number[],
        timeout: number,
        carrierFrequency: number,
    ) {
        gpio.digitalWrite(0);
        try {
            const waveId = PigpioTransmit.createWaveform(pin, signal, carrierFrequency);
            try {
                pigpio.waveTxSend(waveId, pigpio.WAVE_MODE_ONE_SHOT);
                await PigpioTransmit.waitForWave(timeout);
            } finally {
                pigpio.waveDelete(waveId);
            }
        } finally {
            gpio.digitalWrite(0);
        }
    }

    private static createWaveform(pin: number, signal: number[], carrierFrequency: number): number {
        pigpio.waveClear();

        let on = true;
        const waveform: GenericWaveStep[] = [];
        for (const item of signal) {
            if (on) {
                const pulseWidth = ((1.0 / carrierFrequency) * MICROS_PER_SECOND) / 2;
                const count = Math.floor(item / pulseWidth / 2);
                for (let i = 0; i < count; i++) {
                    waveform.push({ gpioOn: pin, gpioOff: 0, usDelay: Math.round(pulseWidth) });
                    waveform.push({ gpioOn: 0, gpioOff: pin, usDelay: Math.round(pulseWidth) });
                }
            } else {
                waveform.push({ gpioOn: 0, gpioOff: pin, usDelay: item });
            }
            on = !on;
        }

        pigpio.waveAddGeneric(waveform);
        const waveId = pigpio.waveCreate();
        if (waveId < 0) {
            throw new Error(`Invalid wave (error code ${waveId})`);
        }
        return waveId;
    }

    private static waitForWave(timeout: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let interval: Timeout | null = setInterval(() => {
                if (!pigpio.waveTxBusy()) {
                    if (clearTimers()) {
                        resolve();
                    }
                }
            }, 1);

            let timeoutTimer: Timeout | null = setTimeout(() => {
                if (clearTimers()) {
                    reject(new Error('timeout waiting to send'));
                }
            }, timeout);

            function clearTimers(): boolean {
                if (interval || timeoutTimer) {
                    if (interval) {
                        clearInterval(interval);
                    }
                    if (timeoutTimer) {
                        clearTimeout(timeoutTimer);
                    }
                    interval = null;
                    timeoutTimer = null;
                    return true;
                }
                return false;
            }
        });
    }
}
