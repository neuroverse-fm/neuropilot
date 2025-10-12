// Minimal ambient declarations for ts-mockito to satisfy type-checking in tests
declare module 'ts-mockito' {
    export function mock<T>(clazz?: new (...args: any[]) => T): T;
    export function instance<T>(mocked: T): T;
    export function verify<T>(value: any): any;
    export function capture<T>(value: any): { last(): [any, ...any[]] };
    export function anything(): any;
    export function reset<T>(mocked: T): void;
}


