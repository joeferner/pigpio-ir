Wrapper around [pigpio](https://github.com/fivdi/pigpio) to provide transmitting and receiving of IR signals using
standard remote controls.

## Install

`npm install pigpio-ir`

## Usage

### Command Line

The following are some useful built in commands to get you started. You will probably need to run them using `sudo`

#### irrecord

`irrecord` is used to populate a configuration file with know IR remotes and buttons.

Example:

```
irrecord --pin=27 --file ~/my-remotes.json --remote=samsung --button=POWER
```

#### irplay

`irplay` is used to play existing buttons back from a file generated from `irrecord`

Example:

```
irplay --pin=17 --file ~/my-remotes.json --remote=samsung --button=POWER
```

#### irlisten

`irlisten` is used to continuously listen for IR signals and print when one is recieved

Example:

```
irlisten --pin=27 --file ~/my-remotes.json
```

### From Node Application

Example program to start listening and print any buttons received

```
import { ButtonEventData, PigpioIr } from 'pigpio-ir';

const pigpioIr = await PigpioIr.fromFile(args.file, {
    inputPin: 17,
    tolerance: 0.1,
});
pigpioIr.on('button', (data: ButtonEventData) => {
    console.log(`button press ${data.remoteName} - ${data.buttonName}`);
});
pigpioIr.start();
```
