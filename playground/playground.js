// Overly complicated Hello World example

const greetingTarget = 'World';
const greeting = 'Hello';
const greetingFormat = '%s, %s!';

const formattedGreeting = greetingFormat
    .replace('%s', greeting)
    .replace('%s', greetingTarget);

console.log(formattedGreeting); // Hello, World!
