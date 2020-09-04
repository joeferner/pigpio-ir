import {Button} from "./Button";

interface TrieNode {
    signals: number[];
    averageSignal: number;
    output: Button | null;
    failure: TrieNode | null;
    children: { [child: number]: TrieNode };
}

export interface AhoCorasickOptions {
    tolerance?: number;
}

export const DEFAULT_OPTIONS: Required<AhoCorasickOptions> = {
    tolerance: 0.10
};

function average(values: number[]): number {
    if (values.length > 0) {
        return values.reduce((sum, i) => sum + i, 0) / values.length;
    }
    return 0;
}

export class AhoCorasick {
    private readonly trie: TrieNode;
    private readonly options: Required<AhoCorasickOptions>;
    private curNode: TrieNode;

    constructor(buttons: Button[], options?: AhoCorasickOptions) {
        this.options = {...DEFAULT_OPTIONS, ...options};
        this.curCode = this.trie = this.buildTrie(buttons);
    }

    private buildTrie(buttons: Button[]): TrieNode {
        const root: TrieNode = {
            signals: [],
            averageSignal: 0,
            output: null,
            failure: null,
            children: {}
        };

        const add = (node: TrieNode, substr: number[], button: Button) => {
            if (substr.length === 0) {
                node.output = button;
                return;
            }
            let child = this.findChild(node, substr[0]);
            if (child) {
                child.signals.push(substr[0]);
                child.averageSignal = average(child.signals);
            } else {
                child = {
                    signals: [substr[0]],
                    averageSignal: substr[0],
                    output: null,
                    failure: null,
                    children: {}
                };
                node.children[substr[0]] = child;
            }
            add(child, substr.slice(1), button);
        };

        for (const button of buttons) {
            add(root, button.signal, button);
        }
        return this.updateFailures(root);
    }

    private updateFailures(root: TrieNode): TrieNode {
        const queue: TrieNode[] = [];
        for (const child of Object.values(root.children)) {
            child.failure = root;
            queue.push(child);
        }

        let node;
        while (node = queue.shift()) {
            for (const child of Object.values(node.children)) {
                child.failure = this.findFailure(child, node);
                queue.push(child);
            }
        }
        return root;
    }

    private findFailure(node: TrieNode, parent: TrieNode): TrieNode {
        if (!node.signals) {
            throw new Error('invalid state');
        }
        let failure: TrieNode = parent;
        while (failure) {
            const matchingChild = this.findChild(failure, node.signals[0]);
            if (matchingChild && matchingChild !== node) {
                return matchingChild;
            }
            if (!failure.failure) {
                return failure;
            }
            failure = failure.failure;
        }
        throw new Error('invalid state');
    }

    appendFind(signal: number): Button | null {
        const child = this.findChild(this.curNode, signal);
        if (child) {
            this.curNode = child;
            if (child.output) {
                return child.output;
            }
        } else if (this.curNode.failure) {
            this.curNode = this.curNode.failure;
            return this.appendFind(signal);
        } else {
            this.curNode = this.trie;
        }
        return null;
    }

    private findChild(node: TrieNode, number: number): TrieNode | null {
        for (const child of Object.values(node.children)) {
            const diff = Math.abs((number - child.averageSignal) / child.averageSignal);
            if (diff < this.options.tolerance) {
                return child;
            }
        }
        return null;
    }
}