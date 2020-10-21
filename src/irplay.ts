#!/usr/bin/env node

import yargs from 'yargs';
import { PigpioIr } from './PigpioIr';

interface Options {
    file: string;
    remote: string;
    button: string;
    pin: number;
    flip?: boolean;
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
        description: 'IR output pin number',
    })
    .option('flip', {
        type: 'boolean',
        description: 'Flip output pin (ie initialize with high state)',
    }).argv;

async function run(args: Options) {
    const pigpioIr = await PigpioIr.fromFile(args.file, {
        create: false,
        outputPin: args.pin,
        outputPinFlip: args.flip,
    });

    console.log('Playing button');
    pigpioIr.transmit(args.remote, args.button);
    console.log(`Button '${args.button}' on remote '${args.remote}' played`);
}

run(argv);
