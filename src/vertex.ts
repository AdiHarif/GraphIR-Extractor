
import { Literal, NodeId, BinaryOperation, UnaryOperation } from "./types";

export enum VertexKind {
    Control = 'control',
    Data = 'data'
};

export abstract class Vertex {
    private static next_id: NodeId = 0;
    public id: NodeId;
    public kind: VertexKind;
    public label: string;

    constructor() {
        this.id = Vertex.next_id++;
    }

    public static getCount(): NodeId {
        return Vertex.next_id;
    }

    public getLabel(): string {
        return String(this.id) + " | " + this.label;
    }
}

abstract class DataVertex extends Vertex {
    kind = VertexKind.Data;
}

export abstract class ControlVertex extends Vertex {
    kind = VertexKind.Control;
}

export class ConstVertex extends DataVertex {
    constructor(public readonly value: Literal) {
        super();
        this.label = String(value);
    }
}

export class ParameterVertex extends DataVertex {
    public pos: number;

    constructor(public readonly position: number) {
        super();
        this.label = `param (${String(position)})`
    }
}

export class BinaryOperationVertex extends DataVertex {
    constructor(public readonly operation: BinaryOperation) {
        super();
        this.label = operation;
    }
}

export class UnaryOperationVertex extends DataVertex {
    constructor(public readonly operation: UnaryOperation) {
        super();
        this.label = operation;
    }
}

export class IfVertex extends ControlVertex {
    public readonly label = 'if'
}

export class WhileVertex extends ControlVertex {
    public readonly label = 'while'
}

export class PhiVertex extends DataVertex {
    public readonly label = 'phi'
}

export class StartVertex extends ControlVertex {
    constructor(public readonly name: string) {
        super();
        this.label = `start (${name})`
    }
}

export class CallVertex extends ControlVertex {
    public readonly label = 'call'
}

export class NewVertex extends ControlVertex {
    constructor(public readonly className: string) {
        super();
        this.label = `new ${className}`
    }
}

export class DummyVertex extends ControlVertex {
    public readonly label = 'dummy'
}

export class MergeVertex extends ControlVertex {
    public readonly label = 'merge'
}

export class ReturnVertex extends ControlVertex {
    public readonly label = 'return'
}

export class ContinueVertex extends ControlVertex {
    public readonly label = 'continue'
}

export class BreakVertex extends ControlVertex {
    public readonly label = 'break'
}

export class LoadVertex extends ControlVertex {
    public readonly label = 'load'
}

export class StoreVertex extends ControlVertex {
    public readonly label = 'store'
}
