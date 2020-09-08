#!/usr/bin/env node

import yargs from 'yargs';
import { PigpioIr } from './PigpioIr';
import { Signal } from './Signal';

interface Options {
    file: string;
    remote: string;
    button: string;
    pin: number;
    tolerance: number;
    tries: number;
    timeout: number;
}

const argv = yargs
    .option('file', {
        alias: 'f',
        type: 'string',
        require: true,
        description: 'File to create/add IR signals to',
    })
    .option('remote', {
        alias: 'r',
        type: 'string',
        require: true,
        description: 'Name of the remote to learn',
    })
    .option('button', {
        alias: 'b',
        type: 'string',
        require: true,
        description: 'Name of the button to learn',
    })
    .option('pin', {
        alias: 'p',
        type: 'number',
        require: true,
        description: 'IR input pin number',
    })
    .option('tolerance', {
        type: 'number',
        description: 'Signal matching tolerance',
        default: PigpioIr.DEFAULT_FILE_OPTIONS.tolerance,
    })
    .option('tries', {
        type: 'number',
        description: 'Number of times to read each button',
        default: 3,
    })
    .option('timeout', {
        type: 'number',
        description: 'Maximum time for an IR signal',
        default: 500,
    }).argv;

async function run(args: Options) {
    const pigpioIr = await PigpioIr.fromFile(args.file, {
        inputPin: args.pin,
        tolerance: args.tolerance,
    });

    const signal = new Signal(args);
    for (let i = 0; i < args.tries; i++) {
        console.log(`Press the '${args.button}' on the '${args.remote}' remote`);
        const singleSignal = await pigpioIr.readSignal(args.timeout);
        signal.appendSignal(singleSignal);
        console.log('OK');
    }
    await PigpioIr.setButtonInFile(args.file, args.remote, args.button, signal.result);
    console.log(`Button '${args.button}' on remote '${args.remote}' saved`);
}

run(argv);
