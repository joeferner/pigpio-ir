export interface Button {
    signal: string;
    debounce?: number;
}

export interface Remote {
    buttons: { [name: string]: Button };
}

export interface PigpioIrFile {
    remotes: { [name: string]: Remote };
}
