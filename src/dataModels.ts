export type CommandFunction = () => void | Promise<void>;

export class Subscription {
    constructor(readonly commandId: string, readonly action: CommandFunction) {}
}
