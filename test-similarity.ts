import { areChaptersSimilar } from './src/lib/similarity';

console.log("Force vs Work:", areChaptersSimilar("Force", "Work"));
console.log("Grammar vs Literature:", areChaptersSimilar("Grammar", "Literature"));
console.log("Chapter 1 vs Chapter 2:", areChaptersSimilar("Chapter 1", "Chapter 2"));
console.log("The Noun vs A Noun:", areChaptersSimilar("The Noun", "A Noun"));
