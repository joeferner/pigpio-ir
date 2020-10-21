#!/usr/bin/env node

import yargs from 'yargs';
import { ButtonEventData, PigpioIr, PullUpDown } from './PigpioIr';

interface Options {
    file: string;
    pin: number;
    tolerance: number;
    pullUpDown?: string;
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
    })
    .option('pullUpDown', {
        type: 'string',
        description: 'Input pin pull up/down setting',
        choices: Object.values(PullUpDown),
        default: PigpioIr.DEFAULT_FILE_OPTIONS.inputPullUpDown,
    }).argv;

async function run(args: Options) {
    const pigpioIr = await PigpioIr.fromFile(args.file, {
        inputPin: args.pin,
        tolerance: args.tolerance,
        inputPullUpDown: args.pullUpDown as PullUpDown,
    });
    pigpioIr.on('button', (data: ButtonEventData) => {
        console.log(`button press ${data.remoteName} - ${data.buttonName}`);
    });
    pigpioIr.start();
    console.log('listening...');
}

run(argv);
