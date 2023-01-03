import { NodeId, BinaryOperation, UnaryOperation } from "./types";

enum VertexKind {
    Control = 'control',
    Data = 'data'
};

export abstract class Vertex {
    private static next_id: NodeId = 0;
    public id: NodeId;
    public kind: VertexKind;

    constructor() {
        this.id = Vertex.next_id++;
    }

    public static getCount(): NodeId {
        return Vertex.next_id;
    }

    abstract getLabel(): string;

    public getLabelPrefix(): string {
        return String(this.id) + " | ";
    }
}

abstract class DataVertex extends Vertex {
    kind = VertexKind.Data;
    constructor() {
        super();
    }
}

export abstract class ControlVertex extends Vertex {
    kind = VertexKind.Control;
    constructor() {
        super();
    }
}

export class ConstVertex extends DataVertex {
    public value: unknown;

    constructor(_value: unknown) {
        super();
        this.value = _value;
    }

    public getLabel(): string {
        return this.getLabelPrefix() + (this.value as string);
    }
}

export class ParameterVertex extends DataVertex {
    public pos: number;

    constructor(_pos: number) {
        super();
        this.pos = _pos;
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "param (" + String(this.pos) + ")";
    }
}

export class BinaryOperationVertex extends DataVertex {
    public operation: BinaryOperation;

    constructor(_operation: BinaryOperation) {
        super();
        this.operation = _operation;
    }

    public getLabel(): string {
        let operation: string;

        switch(this.operation) {
            case BinaryOperation.Add:
                operation = "+";
                break;
            case BinaryOperation.Div:
                operation = "/";
                break;
            case BinaryOperation.Mul:
                operation = "*";
                break;
            case BinaryOperation.Sub:
                operation = "-";
                break;
            case BinaryOperation.Assign:
                operation = "=";
                break;
            case BinaryOperation.LessThan:
                operation = "<";
                break;
            case BinaryOperation.GreaterThan:
                operation = ">";
                break;
            case BinaryOperation.LessThanEqual:
                operation = "<=";
                break;
            case BinaryOperation.GreaterThanEqual:
                operation = ">=";
                break;
            case BinaryOperation.EqualEqual:
                operation = "==";
                break;
            case BinaryOperation.NotEqual:
                operation = "!=";
                break;
            case BinaryOperation.EqualEqualEqual:
                operation = "===";
                break;
            case BinaryOperation.NotEqualEqual:
                operation = "!==";
                break;
            case BinaryOperation.And:
                operation = "&&";
                break;
            case BinaryOperation.Or:
                operation = "||";
                break;
            default:
                throw new Error(`Undefined vertex label`);
        }

        return this.getLabelPrefix() + operation;
    }
}

export class UnaryOperationVertex extends DataVertex {
    public operation: UnaryOperation;

    constructor(_operation: UnaryOperation) {
        super();
        this.operation = _operation;
    }

    public getLabel(): string {
        let operation: string;

        switch(this.operation) {
            case UnaryOperation.Plus:
                operation = "+";
                break;
            case UnaryOperation.Minus:
                operation = "-";
                break;
            case UnaryOperation.Not:
                operation = "!";
                break;
            default:
                throw new Error(`Undefined vertex label`);
        }

        return this.getLabelPrefix() + operation;
    }
}

export class IfVertex extends ControlVertex {
    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "if";
    }
}

export class WhileVertex extends ControlVertex {
    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "while";
    }
}

export class PhiVertex extends DataVertex {

    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "phi";
    }
}

export class StartVertex extends ControlVertex {
    public name: string;

    constructor(_name: string) {
        super();
        this.name = _name;
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "start (" + this.name + ")";
    }
}

export class CallVertex extends ControlVertex {
    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "call";
    }
}

export class NewVertex extends ControlVertex {
    public className: string;

    constructor(_className: string) {
        super();
        this.className = _className;
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "new " + this.className;
    }
}

export class DummyVertex extends ControlVertex {
    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "dummy";
    }
}

export class MergeVertex extends ControlVertex {

    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "merge";
    }
}

export class ReturnVertex extends ControlVertex {

    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "return";
    }
}

export class ContinueVertex extends ControlVertex {
    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "continue";
    }
}

export class BreakVertex extends ControlVertex {

    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "break";
    }
}

export class LoadVertex extends ControlVertex {

    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "load";
    }
}

export class StoreVertex extends ControlVertex {

    constructor() {
        super();
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "store";
    }
}

export class SymbolVertex extends Vertex {
    public name: string;

    constructor(_name: string) {
        super();
        this.name = _name;
    }

    public getLabel(): string {
        return this.getLabelPrefix() + "#" + this.name;
    }
}
