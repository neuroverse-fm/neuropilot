// Overly complicated Hello World example

const greetingTarget = 'World';
const greeting = 'Hello';
const greetingFormat = '%s, %s!';

const formattedGreeting = greetingFormat
    .replace('%s', greeting)
    .replace('%s', greetingTarget);

setTimeout(() => {
    console.log(formattedGreeting); // Hello, World!
}, 1000);

// console.log(formattedGreeting); // Hello, World!
