#!/usr/bin/env node

import yargs from "yargs";

const argv = yargs
    .option('file', {
        alias: 'f',
        type: 'string',
        require: true,
        description: 'File to create/add IR signals to'
    })
    .option('remote', {
        alias: 'r',
        type: 'string',
        require: true,
        description: 'Name of the remote'
    })
    .argv;

console.log(argv);
