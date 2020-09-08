#!/usr/bin/env node

import yargs from 'yargs';
import { ButtonEventData, PigpioIr } from './PigpioIr';

interface Options {
    file: string;
    pin: number;
    tolerance: number;
}

const argv = yargs
    .option('file', {
        alias: 'f',
        type: 'string',
        require: true,
        description: 'File to create/add IR signals to',
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
    }).argv;

async function run(args: Options) {
    const pigpioIr = await PigpioIr.fromFile(args.file, {
        inputPin: args.pin,
        tolerance: args.tolerance,
    });
    pigpioIr.on('button', (data: ButtonEventData) => {
        console.log(`button press ${data.remoteName} - ${data.buttonName}`);
    });
    pigpioIr.start();
    console.log('listening...');
}

run(argv);
