export interface Button {
    signal: string;
}

export interface Remote {
    buttons: { [name: string]: Button };
}

export interface PigpioIrFile {
    remotes: { [name: string]: Remote };
}
